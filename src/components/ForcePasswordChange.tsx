import { useState } from "react";
import { changePassword, signOut } from "../firebase";
import { clearMustChangePassword } from "../firestore";
import { MIN_PASSWORD_LENGTH } from "../constants";
import { WaypointLogo } from "./brand/WaypointLogo";
import "../login.css";

// What someone added from Manage users sees the first time they sign in.
// Their account was made for them on a starting password the super user
// chose (functions/src/users.ts), which went to them by email, so it
// isn't theirs and isn't private: Waypoint shows nothing else until
// they've chosen their own.
//
// The gate is `mustChangePassword` on their designer profile, set when
// the profile was made and cleared here once Firebase has taken the new
// password. It's a first-run step, not a security boundary — the
// password itself is what Firebase checks — so the profile holding it is
// enough.

type Props = {
  // Their own profile, which carries the flag.
  designer: { name: string; email?: string };
};

function friendlyError(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: string }).code;
    switch (code) {
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "That current password isn't right. It's the one from your welcome email.";
      case "auth/weak-password":
        return `Pick a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
      case "auth/too-many-requests":
        return "Too many attempts. Try again in a minute.";
      case "auth/network-request-failed":
        return "Network error. Check your connection and try again.";
      case "auth/requires-recent-login":
        return "For safety, sign in again and then change your password.";
    }
  }
  return err instanceof Error ? err.message : String(err);
}

export function ForcePasswordChange({ designer }: Props) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`Your new password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (next === current) {
      setError("Pick something other than the starting password.");
      return;
    }
    if (next !== confirm) {
      setError("The two new passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
    } catch (err) {
      console.error(err);
      setError(friendlyError(err));
      setBusy(false);
      return;
    }
    // Only now: the flag is what's holding them here, and the app opens
    // on its own as soon as their profile changes. The password is
    // already theirs if this fails, so say so rather than send them
    // round the form again with a password that no longer works.
    try {
      await clearMustChangePassword();
    } catch (err) {
      console.error(err);
      setError(
        "Your new password is saved, but Waypoint couldn't finish opening. Sign out and sign back in with it.",
      );
      setBusy(false);
    }
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
            <h2>Choose your password</h2>
          </div>
          <p className="lg-note">
            Welcome to Waypoint, {designer.name.split(/\s+/)[0] || "there"}. Your account was set
            up with a starting password that was emailed to you. Choose one of your own and
            Waypoint opens.
          </p>
          <form className="lg-form" onSubmit={submit} noValidate>
            <label className="lg-field">
              <span>Starting password</span>
              <input
                autoFocus
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                disabled={busy}
                autoComplete="current-password"
                placeholder="From your welcome email"
              />
            </label>
            <label className="lg-field">
              <span>New password</span>
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                disabled={busy}
                autoComplete="new-password"
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              />
            </label>
            <label className="lg-field">
              <span>New password again</span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={busy}
                autoComplete="new-password"
              />
            </label>
            <div className="lg-actions">
              <button
                className="lg-btn lg-btn-primary"
                type="submit"
                disabled={busy || !current || !next || !confirm}
              >
                {busy ? "Saving…" : "Save and open Waypoint"}
              </button>
            </div>
          </form>
          {error && (
            <p className="lg-error" role="alert">
              {error}
            </p>
          )}
          <p className="lg-card-foot">
            Signed in as {designer.email || "your Waypoint account"}.{" "}
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
