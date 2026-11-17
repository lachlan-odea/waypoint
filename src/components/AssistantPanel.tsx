import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  AssistantError,
  askAssistant,
  listModels,
  normaliseEndpoint,
  preferredModel,
  type AssistantConnection,
  type AssistantMessage,
} from "../assistant";
import type { ActionContext, AssistantAction, Proposal } from "../assistantActions";
import { todayIso } from "../dates";
import { Icon } from "./Icon";
import "../assistant.css";

type Props = {
  open: boolean;
  // What the assistant can look things up in: the app's data as it stands.
  data: Omit<ActionContext, "today">;
  // Make a change the person has approved. Returns where the changed thing
  // can be opened, or why it couldn't be saved.
  onApplyAction: (action: AssistantAction) => { ok: true; link?: string } | { ok: false; error: string };
  // The shared gateway connection, or null until a super user sets it up.
  connection: AssistantConnection | null;
  // Super users set the connection up and change it; everyone else just asks.
  canConfigure: boolean;
  onSaveConnection: (c: AssistantConnection) => Promise<void>;
  onRemoveConnection: () => Promise<void>;
  onClose: () => void;
};

const SUGGESTIONS = [
  "What's due this week?",
  "What am I assigned to right now?",
  "Which events are coming up in the next two months?",
  "Create a project for me",
];

// The assistant: a chat panel docked to the right edge, opened from the
// header. It answers questions about the team's work by looking things up
// in what the app has loaded (assistantTools.ts). It can propose changes,
// each shown as a card that does nothing until the person clicks Apply
// (assistantActions.ts).
// A super user connects it once to the company's LLM gateway, and that one
// connection serves everyone (assistant.ts). The conversation lives here for as long as the
// app is open, so closing the panel to look at a page and opening it again
// picks up where it left off; it is not saved anywhere.
export function AssistantPanel({
  open,
  data,
  onApplyAction,
  connection,
  canConfigure,
  onSaveConnection,
  onRemoveConnection,
  onClose,
}: Props) {
  // The connection screen, for super users: shown until there is a
  // connection, and again from the settings button.
  const [connecting, setConnecting] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  // The answer being written, and what the assistant is doing meanwhile.
  const [pending, setPending] = useState<{ text: string; status: string } | null>(null);
  const [error, setError] = useState<AssistantError | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  // Bumped by "New chat", so an answer still arriving for the conversation
  // that was cleared is dropped instead of landing in the new one.
  const generation = useRef(0);

  const busy = pending !== null;
  const showSetup = canConfigure && (!connection || connecting);

  useEffect(() => {
    if (open && !showSetup) input.current?.focus();
  }, [open, showSetup]);

  // Keep the newest text in view as it arrives.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending, error, open]);

  // Ask the last message of `next` (a question) and add the answer to it.
  async function ask(next: AssistantMessage[]) {
    if (!connection) return;
    const mine = generation.current;
    setMessages(next);
    setError(null);
    setPending({ text: "", status: "Thinking" });
    try {
      const { text: answer, proposals } = await askAssistant(connection, { ...data, today: todayIso() }, next, {
        onText: (piece) => {
          if (generation.current !== mine) return;
          setPending((p) => (p ? { text: p.text + piece, status: "" } : p));
        },
        onStatus: (status) => {
          if (generation.current !== mine) return;
          setPending((p) => (p ? { ...p, status } : p));
        },
      });
      if (generation.current !== mine) return;
      setMessages([
        ...next,
        {
          role: "assistant",
          text: answer || (proposals.length ? "" : "I didn't find anything to say to that. Try asking it another way."),
          proposals: proposals.length ? proposals : undefined,
        },
      ]);
    } catch (err) {
      if (generation.current !== mine) return;
      setError(err instanceof AssistantError ? err : new AssistantError("other", "The assistant couldn't answer that. Try again."));
    } finally {
      if (generation.current === mine) {
        setPending(null);
        input.current?.focus();
      }
    }
  }

  function send(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setDraft("");
    void ask([...messages, { role: "user", text }]);
  }

  // After a failure the question is still the last message: ask it again.
  function retry() {
    if (busy || messages[messages.length - 1]?.role !== "user") return;
    void ask(messages);
  }

  function updateProposal(id: string, patch: Partial<Proposal>) {
    setMessages((all) =>
      all.map((m) =>
        m.proposals?.some((p) => p.id === id)
          ? { ...m, proposals: m.proposals.map((p) => (p.id === id ? { ...p, ...patch } : p)) }
          : m,
      ),
    );
  }

  function applyProposal(p: Proposal) {
    const result = onApplyAction(p.action);
    updateProposal(p.id, result.ok ? { state: "applied", link: result.link, error: undefined } : { state: "failed", error: result.error });
  }

  function newChat() {
    generation.current++;
    setMessages([]);
    setPending(null);
    setError(null);
    setDraft("");
    input.current?.focus();
  }

  if (!open) return null;

  const empty = messages.length === 0;
  const firstName = data.me.name.trim().split(/\s+/)[0] || "there";

  return (
    <aside
      className="assistant-panel"
      aria-label="Waypoint assistant"
      // Escape closes the panel only while the keyboard is in it, so it
      // doesn't also close when Escape dismisses a window on the page.
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <header className="assistant-head">
        <div className="assistant-title">
          <Icon name="sparkles" size={18} />
          <h2>Ask AI</h2>
        </div>
        <div className="assistant-head-actions">
          {!showSetup && !empty && (
            <button type="button" className="btn btn-sm btn-secondary" onClick={newChat}>
              New chat
            </button>
          )}
          {connection && canConfigure && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => setConnecting((c) => !c)}
              aria-label="Assistant connection"
              title="Connection"
              aria-pressed={connecting}
            >
              <Icon name="settings" size={16} />
            </button>
          )}
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close the assistant">
            <Icon name="close" size={16} />
          </button>
        </div>
      </header>

      {showSetup ? (
        <ConnectionForm
          current={connection}
          onSave={async (c) => {
            await onSaveConnection(c);
            setConnecting(false);
            setError(null);
          }}
          onRemove={async () => {
            await onRemoveConnection();
            setConnecting(false);
          }}
          onCancel={connection ? () => setConnecting(false) : undefined}
        />
      ) : !connection ? (
        <div className="assistant-scroll">
          <div className="assistant-empty">
            <p className="assistant-hello">The assistant isn't set up yet</p>
            <p className="muted small">
              A super user needs to connect it once. After that it's ready for everyone, with nothing to
              enter.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="assistant-scroll" ref={scroller}>
            {empty ? (
              <div className="assistant-empty">
                <p className="assistant-hello">Hi {firstName}. What do you want to know?</p>
                <p className="muted small">
                  I can look through projects, campaigns, webinars, events and the social calendar, and help
                  you draft or summarise. I can also create and update things for you: I'll show each change
                  first, and nothing is saved until you click Apply.
                </p>
                <ul className="assistant-suggestions">
                  {SUGGESTIONS.map((s) => (
                    <li key={s}>
                      <button type="button" className="assistant-suggestion" onClick={() => send(s)}>
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <ol className="assistant-thread" aria-live="polite">
                {messages.map((m, i) => (
                  <li key={i} className={`assistant-msg from-${m.role}`}>
                    {m.role === "user" ? <p>{m.text}</p> : m.text && <Markdown text={m.text} />}
                    {m.proposals?.map((p) => (
                      <ProposalCard
                        key={p.id}
                        proposal={p}
                        onApply={() => applyProposal(p)}
                        onDismiss={() => updateProposal(p.id, { state: "dismissed" })}
                      />
                    ))}
                  </li>
                ))}
                {pending && (
                  <li className="assistant-msg from-assistant">
                    {pending.text && <Markdown text={pending.text} />}
                    {(pending.status || !pending.text) && (
                      <p className="assistant-status">{pending.status || "Thinking"}…</p>
                    )}
                  </li>
                )}
              </ol>
            )}
            {error && (
              <div className="assistant-error" role="alert">
                <p>{error.message}</p>
                <div className="assistant-error-actions">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={retry}>
                    Try again
                  </button>
                  {error.kind !== "other" && canConfigure && (
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setConnecting(true)}>
                      Check the connection
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <form
            className="assistant-compose"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <textarea
              ref={input}
              className="assistant-input"
              rows={2}
              value={draft}
              placeholder="Ask about projects, campaigns, events…"
              aria-label="Your question"
              maxLength={6000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter starts a new line.
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(draft);
                }
              }}
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()}>
              {busy ? "Answering…" : "Ask"}
            </button>
          </form>
          <p className="assistant-foot muted small">
            Answers come from an AI model reading Waypoint. Check anything important.
          </p>
        </>
      )}
    </aside>
  );
}

// ── A proposed change ──────────────────────────────────────────────────
// What the assistant wants to do, laid out so it can be checked at a
// glance, with the buttons that decide it. Once applied or dismissed the
// card stays in the thread as a record of what happened.

function ProposalCard({
  proposal,
  onApply,
  onDismiss,
}: {
  proposal: Proposal;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const { state } = proposal;
  return (
    <div className={`assistant-proposal is-${state}`}>
      <p className="assistant-proposal-title">{proposal.title}</p>
      <dl className="assistant-proposal-details">
        {proposal.details.map(([label, value], i) => (
          <div key={i}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {state === "failed" && (
        <p className="assistant-proposal-error" role="alert">
          {proposal.error}
        </p>
      )}
      {state === "pending" || state === "failed" ? (
        <div className="assistant-proposal-actions">
          <button type="button" className="btn btn-sm btn-primary" onClick={onApply}>
            {state === "failed" ? "Try again" : "Apply"}
          </button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      ) : (
        <p className="assistant-proposal-outcome">
          {state === "applied" ? (
            <>
              <Icon name="checkmark" size={14} /> Applied
              {proposal.link && (
                <a href={proposal.link} className="assistant-link">
                  Open
                </a>
              )}
            </>
          ) : (
            "Dismissed. Nothing was changed."
          )}
        </p>
      )}
    </div>
  );
}

// ── Connecting to the gateway ──────────────────────────────────────────
// For super users. Two steps in one form: the address and key are checked
// by asking the gateway which models the key can use, then a model is
// picked. Nothing is saved until then; saving shares it with everyone.

function ConnectionForm({
  current,
  onSave,
  onRemove,
  onCancel,
}: {
  current: AssistantConnection | null;
  onSave: (c: AssistantConnection) => Promise<void>;
  onRemove: () => Promise<void>;
  onCancel?: () => void;
}) {
  const [endpoint, setEndpoint] = useState(current?.endpoint ?? "");
  const [apiKey, setApiKey] = useState(current?.apiKey ?? "");
  const [models, setModels] = useState<string[] | null>(null);
  const [model, setModel] = useState(current?.model ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function check(e: FormEvent) {
    e.preventDefault();
    const url = normaliseEndpoint(endpoint);
    const key = apiKey.trim();
    if (!url || !key || busy) return;
    setBusy(true);
    setError("");
    try {
      const found = await listModels(url, key);
      if (found.length === 0) {
        setError("That key works, but the gateway lists no models for it. Ask whoever issued the key.");
        return;
      }
      setEndpoint(url);
      setModels(found);
      setModel(found.includes(model) ? model : preferredModel(found));
    } catch (err) {
      setModels(null);
      setError(err instanceof Error ? err.message : "The gateway couldn't be reached.");
    } finally {
      setBusy(false);
    }
  }

  // Saving and removing write the shared settings document.
  async function store(write: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await write();
    } catch (err) {
      console.error(err);
      setError("That couldn't be saved. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!models || !model) return;
    void store(() => onSave({ endpoint: normaliseEndpoint(endpoint), apiKey: apiKey.trim(), model }));
  }

  return (
    <div className="assistant-scroll">
      <form className="assistant-setup" onSubmit={check}>
        <p className="assistant-hello">Connect the assistant</p>
        <p className="muted small">
          The assistant runs on the company's LLM gateway, which only answers on the company network (the
          office or the VPN). Enter the gateway's address and the team's shared key once, and the
          assistant is ready for everyone on Waypoint. They're saved in Waypoint's settings, not in the
          code.
        </p>
        <label className="field">
          <span>Gateway address</span>
          <input
            type="url"
            value={endpoint}
            placeholder="https://…"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setEndpoint(e.target.value);
              setModels(null);
            }}
            disabled={busy}
          />
        </label>
        <label className="field">
          <span>Shared API key</span>
          <input
            type="password"
            value={apiKey}
            placeholder="sk-…"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setApiKey(e.target.value);
              setModels(null);
            }}
            disabled={busy}
          />
        </label>
        {models && (
          <label className="field">
            <span>Model</span>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <span className="field-hint">The models the key can use. A Claude Haiku model is quick and cheap.</span>
          </label>
        )}
        {error && (
          <p className="assistant-error" role="alert">
            {error}
          </p>
        )}
        <div className="assistant-setup-actions">
          {models ? (
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !model}>
              Save for everyone
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={busy || !endpoint.trim() || !apiKey.trim()}>
              {busy ? "Checking…" : "Connect"}
            </button>
          )}
          {onCancel && (
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
          {current && (
            <button type="button" className="btn btn-secondary" onClick={() => void store(onRemove)} disabled={busy}>
              Disconnect
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

// ── The answer's formatting ────────────────────────────────────────────
// The model writes light Markdown: paragraphs, bullet and numbered lists,
// bold, inline code and links. Rendered as React elements (never as HTML),
// so nothing in an answer can inject markup. Links are kept only when they
// open a Waypoint page (#project/…, #campaign/…, #event/…) or an https
// address; anything else is shown as its text.

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ul" | "ol"; items: string[] };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      if (!current || current.kind !== kind) {
        flush();
        current = { kind, items: [] };
      }
      (current as { items: string[] }).items.push((bullet ?? numbered)![1]);
      continue;
    }
    // A heading is shown as a bold line: the panel is too narrow for more.
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      flush();
      blocks.push({ kind: "p", lines: [`**${heading[1].replace(/\*\*/g, "")}**`] });
      continue;
    }
    // An indented line under a list item continues that item.
    if (current && current.kind !== "p" && /^\s+/.test(raw)) {
      const items = current.items;
      items[items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    if (!current || current.kind !== "p") {
      flush();
      current = { kind: "p", lines: [] };
    }
    current.lines.push(line);
  }
  flush();
  return blocks;
}

const INLINE = /(\[[^\]\n]+\]\([^)\s]+\)|\*\*[^*\n]+\*\*|`[^`\n]+`)/g;

function inline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    const link = part.match(/^\[([^\]\n]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const [, label, href] = link;
      if (/^#(project|campaign|event)\/[^/\s]+/.test(href)) {
        return (
          <a key={key} href={href} className="assistant-link">
            {label}
          </a>
        );
      }
      if (/^https:\/\//i.test(href)) {
        return (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="assistant-link">
            {label}
          </a>
        );
      }
      return <span key={key}>{label}</span>;
    }
    if (/^\*\*[^*\n]+\*\*$/.test(part)) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (/^`[^`\n]+`$/.test(part)) return <code key={key}>{part.slice(1, -1)}</code>;
    return <span key={key}>{part}</span>;
  });
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="assistant-md">
      {parseBlocks(text).map((b, i) => {
        if (b.kind === "p") {
          return (
            <p key={i}>
              {b.lines.map((line, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  {inline(line, `${i}-${j}`)}
                </span>
              ))}
            </p>
          );
        }
        const List = b.kind;
        return (
          <List key={i}>
            {b.items.map((item, j) => (
              <li key={j}>{inline(item, `${i}-${j}`)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
