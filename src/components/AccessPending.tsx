import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { AccessRequest } from "../types";
import { refreshEmailVerified, resendVerificationEmail, signOut } from "../firebase";
import { createAccessRequest, watchOwnAccessRequest } from "../firestore";
import { ALLOWED_EMAIL_DOMAIN } from "../constants";
import { WaypointLogo } from "./brand/WaypointLogo";
import "../login.css";

// What someone signed in without a Waypoint profile sees. Firestore lets
// them read nothing but their own profile and access request, so this is
// the whole app for them until a super user approves:
//
//   1. Verify the email address (the rules only take a request from a
//      verified address, so nobody can ask as someone else).
//   2. The request is sent, under the name they gave when signing up.
//   3. Wait. Approval creates their profile, App.tsx sees it and opens
//      Waypoint on its own; a decline is shown here.

type Props = { user: User };

// How often to ask Firebase whether the address has been verified while
// this screen is open and visible.
const VERIFY_POLL_MS = 5000;

function friendlyError(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: string }).code;
    if (code === "auth/too-many-requests") return "Too many attempts. Try again in a minute.";
    if (code === "auth/network-request-failed") return "Network error. Check your connection and try again.";
    if (code === "permission-denied") return "Waypoint couldn't take that request. Check your email is verified and try again.";
  }
  return err instanceof Error ? err.message : String(err);
}

export function AccessPending({ user }: Props) {
  const email = (user.email ?? "").toLowerCase();
  const allowedDomain = email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
  const [verified, setVerified] = useState(user.emailVerified);
  // undefined while loading; null when no request has been sent.
  const [request, setRequest] = useState<AccessRequest | null | undefined>(undefined);
  const [name, setName] = useState(user.displayName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const autoSent = useRef(false);

  // Until verified: re-check when the person comes back to the tab (they
  // were most likely in their inbox) and every few seconds while it's open.
  useEffect(() => {
    if (verified) return;
    const check = () => {
      if (document.visibilityState !== "visible") return;
      refreshEmailVerified()
        .then((v) => {
          if (v) setVerified(true);
        })
        .catch((err) => console.warn("Couldn't check email verification", err));
    };
    const timer = window.setInterval(check, VERIFY_POLL_MS);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [verified]);

  useEffect(() => {
    return watchOwnAccessRequest(user.uid, setRequest, (err) => {
      console.warn("Couldn't load your access request", err);
      setRequest(null);
    });
  }, [user.uid]);

  // Someone who just asked for access on the sign-in screen already gave
  // their name, so once verified the request goes without another click.
  useEffect(() => {
    if (!verified || !allowedDomain || request !== null || autoSent.current) return;
    const given = (user.displayName ?? "").trim();
    if (!given) return;
    autoSent.current = true;
    createAccessRequest(user.uid, given, email).catch((err) => {
      console.error(err);
      setError(friendlyError(err));
    });
  }, [verified, allowedDomain, request, user.uid, user.displayName, email]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await work();
    } catch (err) {
      console.error(err);
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const checkNow = () =>
    run(async () => {
      const v = await refreshEmailVerified();
      if (v) setVerified(true);
      else setNote("Not verified yet. Open the link in the email, then try again.");
    });

  const resend = () =>
    run(async () => {
      await resendVerificationEmail();
      setNote(`Sent again to ${email}. Check your junk folder if it isn't there.`);
    });

  const sendRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Enter your name so the admins know who's asking.");
      return;
    }
    void run(() => createAccessRequest(user.uid, name, email));
  };

  let heading: string;
  let body: React.ReactNode;
  if (!allowedDomain) {
    heading = "Waypoint isn't open to this address";
    body = (
      <p className="lg-note">
        Only @{ALLOWED_EMAIL_DOMAIN} addresses can request access. You're signed in as{" "}
        <strong>{email || "an account without an email"}</strong>.
      </p>
    );
  } else if (!verified) {
    heading = "Verify your email";
    body = (
      <>
        <p className="lg-note">
          We sent a link to <strong>{email}</strong>. Open it to confirm the address is yours;
          your request goes to the Waypoint admins as soon as it's verified.
        </p>
        <div className="lg-actions">
          <button type="button" className="lg-btn lg-btn-primary" onClick={checkNow} disabled={busy}>
            {busy ? "Checking…" : "I've verified it"}
          </button>
          <button type="button" className="lg-btn lg-btn-secondary" onClick={resend} disabled={busy}>
            Send the email again
          </button>
        </div>
      </>
    );
  } else if (request === undefined) {
    heading = "Checking your access…";
    body = null;
  } else if (request === null) {
    heading = "Request access";
    body = (
      <form className="lg-form" onSubmit={sendRequest} noValidate>
        <p className="lg-note">
          Your email is verified. Send a request and a Waypoint admin will review it.
        </p>
        <label className="lg-field">
          <span>Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            placeholder="e.g. Jess Duguid"
            autoComplete="name"
          />
        </label>
        <div className="lg-actions">
          <button className="lg-btn lg-btn-primary" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send request"}
          </button>
        </div>
      </form>
    );
  } else if (request.status === "pending") {
    heading = "Request sent";
    body = (
      <p className="lg-note">
        Thanks, {request.name.split(/\s+/)[0] || "there"}. A Waypoint admin will review your
        request and you'll get an email at <strong>{request.email}</strong> once it's approved.
        You can leave this page; Waypoint opens here by itself when you're in.
      </p>
    );
  } else if (request.status === "declined") {
    heading = "Request not approved";
    body = (
      <p className="lg-note">
        Your request for Waypoint access wasn't approved
        {request.decidedByName ? ` by ${request.decidedByName}` : ""}. If you think that's a
        mistake, contact them or your team lead.
      </p>
    );
  } else {
    // Approved once, but the profile is gone: access was removed later.
    heading = "You don't have access right now";
    body = (
      <p className="lg-note">
        Your Waypoint access has been removed. Ask a Waypoint admin if you need it back.
      </p>
    );
  }

  return (
    <div className="lg">
      <div className="lg-grid" aria-hidden="true" />
      <div className="lg-main">
        <div className="lg-card">
          <div className="lg-logo-slot">
            <WaypointLogo variant="horizontal" color="blue" height={36} />
          </div>
          <div className="lg-card-head">
            <h2>{heading}</h2>
          </div>
          {body}
          {error && (
            <p className="lg-error" role="alert">
              {error}
            </p>
          )}
          {note && (
            <p className="lg-note" role="status">
              {note}
            </p>
          )}
          <p className="lg-card-foot">
            Signed in as {email || "an unknown account"}.{" "}
            <button
              type="button"
              className="lg-link"
              onClick={() => signOut().catch(console.error)}
              disabled={busy}
            >
              Sign out
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
