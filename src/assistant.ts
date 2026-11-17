// The assistant's conversation with the model. The browser talks straight
// to the company's LLM gateway, which speaks Anthropic's Messages API and
// is only reachable from inside the company network; a Cloud Function
// can't reach it, which is why this runs here and not in functions/.
//
// Everyone uses one shared connection: the gateway's address, one key and
// the model, saved once by a super user from the panel into Firestore at
// /settings/assistant. They aren't in the repo, which is public. Like the
// other settings documents, any signed-in account can read it; the key is
// only usable from inside the company network. The model reads Waypoint
// through the look-ups in assistantTools.ts, run here against the data the
// app already holds.

import type Anthropic from "@anthropic-ai/sdk";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { ASSISTANT_TOOLS, TOOL_STATUS, assistantSystemPrompt, runAssistantTool } from "./assistantTools";
import {
  ACTION_STATUS,
  ACTION_TOOLS,
  proposalNote,
  proposeAction,
  type ActionContext,
  type Proposal,
} from "./assistantActions";

export type AssistantMessage = {
  role: "user" | "assistant";
  text: string;
  // Changes the assistant proposed in this answer, each a card the person
  // applies or dismisses (assistantActions.ts).
  proposals?: Proposal[];
};

const TOOLS = [...ASSISTANT_TOOLS, ...ACTION_TOOLS];

export type AssistantConnection = {
  // The gateway's address, without a trailing /v1.
  endpoint: string;
  apiKey: string;
  // A model id as the gateway lists it.
  model: string;
};

// One question may take several model turns (a look-up, then the answer);
// the cap stops a loop that never settles.
const MAX_TURNS = 8;
const MAX_OUTPUT_TOKENS = 4096;
// Earlier turns sent with each question.
const MAX_HISTORY = 24;

const connectionDoc = () => doc(collection(db, "settings"), "assistant");

// The shared connection, or null until a super user has set it up.
export function subscribeAssistantConnection(
  onChange: (connection: AssistantConnection | null) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    connectionDoc(),
    (snap) => {
      const d = snap.data() as Partial<AssistantConnection> | undefined;
      onChange(d?.endpoint && d.apiKey && d.model ? { endpoint: d.endpoint, apiKey: d.apiKey, model: d.model } : null);
    },
    onError,
  );
}

export async function saveAssistantConnection(c: AssistantConnection, savedBy: string): Promise<void> {
  await setDoc(connectionDoc(), { ...c, updatedAt: new Date().toISOString(), updatedBy: savedBy });
}

export async function removeAssistantConnection(): Promise<void> {
  await deleteDoc(connectionDoc());
}

// "llm-gateway.example/v1/" → "https://llm-gateway.example". The SDK adds
// /v1/messages itself, so a pasted /v1 would double up.
export function normaliseEndpoint(input: string): string {
  let url = input.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

// The SDK is only needed once someone asks a question, so it loads then
// and stays out of the app's first download.
async function sdk() {
  return (await import("@anthropic-ai/sdk")).default;
}

async function clientFor(endpoint: string, apiKey: string): Promise<Anthropic> {
  const Client = await sdk();
  return new Client({
    apiKey,
    baseURL: endpoint,
    // The call has to come from the browser: it is the only part of
    // Waypoint that sits inside the network the gateway answers on.
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
  });
}

// The models this key can use, as the gateway names them.
export async function listModels(endpoint: string, apiKey: string): Promise<string[]> {
  const client = await clientFor(endpoint, apiKey);
  try {
    const page = await client.models.list({ limit: 1000 });
    return page.data.map((m) => m.id).filter(Boolean).sort();
  } catch (err) {
    throw await asAssistantError(err);
  }
}

// The model to offer first: a Haiku if the key has one, else any Claude.
export function preferredModel(models: string[]): string {
  const newestFirst = models.slice().sort().reverse();
  return (
    newestFirst.find((m) => /haiku/i.test(m)) ?? newestFirst.find((m) => /claude/i.test(m)) ?? models[0] ?? ""
  );
}

export type AssistantHandlers = {
  // A piece of the answer, in order.
  onText: (piece: string) => void;
  // What the assistant is doing between pieces ("Looking through projects").
  onStatus: (status: string) => void;
};

// Why a request failed, in words for the panel. `kind` lets it send the
// person back to the connection screen when the key is the problem.
export class AssistantError extends Error {
  readonly kind: "auth" | "network" | "other";
  constructor(kind: "auth" | "network" | "other", message: string) {
    super(message);
    this.kind = kind;
  }
}

async function asAssistantError(err: unknown): Promise<AssistantError> {
  if (err instanceof AssistantError) return err;
  const Client = await sdk();
  if (err instanceof Client.AuthenticationError || err instanceof Client.PermissionDeniedError) {
    return new AssistantError("auth", "The gateway didn't accept the assistant's key. A super user needs to check the connection.");
  }
  if (err instanceof Client.NotFoundError) {
    return new AssistantError("auth", "The gateway doesn't know that model or address. Check the connection.");
  }
  if (err instanceof Client.RateLimitError) {
    return new AssistantError("other", "The key's limit has been reached for now. Try again in a minute.");
  }
  // No response at all: off the network, the address is wrong, or the
  // browser blocked the call.
  if (err instanceof Client.APIConnectionError) {
    return new AssistantError(
      "network",
      "The gateway couldn't be reached. It only answers on the company network, so check you're in the office or on the VPN, and that the address is right.",
    );
  }
  if (err instanceof Client.APIError) {
    const detail = err.message ? ` ${err.message.slice(0, 300)}` : "";
    return new AssistantError("other", `The gateway couldn't answer that (${err.status ?? "error"}).${detail}`);
  }
  console.error(err);
  return new AssistantError("other", "The assistant couldn't answer that. Try again.");
}

// Ask the last message in `messages` (a question), given the turns before
// it. Resolves with the whole answer once it's finished, and any changes
// it proposed along the way.
export async function askAssistant(
  connection: AssistantConnection,
  data: ActionContext,
  messages: AssistantMessage[],
  handlers: AssistantHandlers,
): Promise<{ text: string; proposals: Proposal[] }> {
  let recent = messages.slice(-MAX_HISTORY);
  while (recent.length && recent[0].role !== "user") recent = recent.slice(1);

  const client = await clientFor(connection.endpoint, connection.apiKey);
  const system = assistantSystemPrompt(data, Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
  // Earlier answers carry a line on each change they proposed and what
  // became of it, so the model knows what was applied.
  const thread: Anthropic.MessageParam[] = recent.map((m) => ({
    role: m.role,
    content: [m.text, ...(m.proposals ?? []).map(proposalNote)].filter(Boolean).join("\n\n") || "(no text)",
  }));

  const proposals: Proposal[] = [];
  let answer = "";
  const say = (piece: string) => {
    answer += piece;
    handlers.onText(piece);
  };

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      // Thinking and effort are left at the model's defaults: which Claude
      // the gateway serves is the key's business, and the older ones reject
      // the newer settings.
      const stream = client.messages.stream({
        model: connection.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        tools: TOOLS,
        messages: thread,
      });
      stream.on("text", say);
      const message = await stream.finalMessage();

      if (message.stop_reason === "refusal") {
        if (!answer.trim()) say("I can't help with that one. Try asking it another way.");
        break;
      }
      if (message.stop_reason === "max_tokens") {
        say("\n\n(That answer ran long and was cut off. Ask for the rest, or narrow the question.)");
        break;
      }
      if (message.stop_reason !== "tool_use") break;

      const calls = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      // A line said before a look-up shouldn't run into the answer after it.
      if (answer && !answer.endsWith("\n")) say("\n\n");
      const results = calls.map((call): Anthropic.ToolResultBlockParam => {
        handlers.onStatus(TOOL_STATUS[call.name] ?? ACTION_STATUS[call.name] ?? "Looking that up");
        const proposed = proposeAction(data, call.name, call.input);
        if (proposed?.proposal) proposals.push(proposed.proposal);
        const { content, isError } = proposed ?? runAssistantTool(data, call.name, call.input);
        return { type: "tool_result", tool_use_id: call.id, content, ...(isError ? { is_error: true } : {}) };
      });
      thread.push({ role: "assistant", content: message.content }, { role: "user", content: results });

      if (turn === MAX_TURNS - 1) {
        say("I've looked in a lot of places without settling on an answer. Try a narrower question.");
      }
    }
  } catch (err) {
    throw await asAssistantError(err);
  }
  return { text: answer.trim(), proposals };
}
