import { defineSecret, defineString } from "firebase-functions/params";

// Outgoing mail goes through Microsoft Graph as the Entra app registration,
// with the client-credentials flow: no user signs in, the app sends as the
// mailbox named by GRAPH_SENDER. The app needs the Microsoft Graph
// application permission Mail.Send with admin consent, and should be held
// to that one mailbox with an Exchange Online application access policy
// (New-ApplicationAccessPolicy), so a leaked secret can't send as anyone.
//
// Set the three secrets with `firebase functions:secrets:set <NAME>`; the
// sender is an ordinary string parameter, answered at the first deploy and
// kept in functions/.env.
export const GRAPH_TENANT_ID = defineSecret("GRAPH_TENANT_ID");
export const GRAPH_CLIENT_ID = defineSecret("GRAPH_CLIENT_ID");
export const GRAPH_CLIENT_SECRET = defineSecret("GRAPH_CLIENT_SECRET");
export const GRAPH_SENDER = defineString("GRAPH_SENDER", {
  description:
    "Mailbox the Entra app sends Waypoint email from (a user principal name, e.g. waypoint@wisetechglobal.com)",
});

// Every function that sends mail lists these in its `secrets` option.
export const MAIL_SECRETS = [GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET];

type CachedToken = { value: string; expiresAt: number };

// One token per warm instance, renewed a minute before it expires.
let cached: CachedToken | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
  const tenant = GRAPH_TENANT_ID.value().trim();
  const body = new URLSearchParams({
    client_id: GRAPH_CLIENT_ID.value().trim(),
    client_secret: GRAPH_CLIENT_SECRET.value(),
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  if (!res.ok) {
    throw new Error(`Entra token request failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

export type OutgoingMail = {
  to: string[];
  subject: string;
  html: string;
};

// Send one message as the configured mailbox. Throws on any failure so the
// caller's log shows what Graph said; nothing is retried here.
export async function sendMail(mail: OutgoingMail): Promise<void> {
  const to = mail.to.map((a) => a.trim()).filter(Boolean);
  if (to.length === 0) return;
  const token = await accessToken();
  const sender = GRAPH_SENDER.value().trim();
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: mail.subject,
          body: { contentType: "HTML", content: mail.html },
          toRecipients: to.map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: false,
      }),
    },
  );
  if (res.status === 401) cached = null; // Token rejected: fetch a fresh one next time.
  if (!res.ok) {
    throw new Error(
      `Graph sendMail to ${to.join(", ")} failed: ${res.status} ${await res.text()}`,
    );
  }
}
