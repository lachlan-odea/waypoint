import { useEffect, useRef, useState } from "react";
import type { Designer } from "../types";
import {
  claimDesignerProfile,
  createDesignerProfile,
  loadDesigner,
  loadDesignerProfiles,
} from "../firestore";
import { resetPassword, signIn, signUp } from "../firebase";

const heroImage = `${import.meta.env.BASE_URL}hero.png`;

// Restrict signups to the team's email domain. Loosen / remove if you want
// outside collaborators to be able to register themselves.
const ALLOWED_EMAIL_DOMAIN = "wisetechglobal.com";

type Mode = "signin" | "signup";

type Props = {
  onSignedIn: (designerId: string) => void;
};

function friendlyError(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: string }).code;
    switch (code) {
      case "auth/invalid-email":
        return "That doesn't look like a valid email.";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Email or password is incorrect.";
      case "auth/email-already-in-use":
        return "An account with that email already exists. Try Sign in.";
      case "auth/weak-password":
        return "Password needs to be at least 6 characters.";
      case "auth/too-many-requests":
        return "Too many attempts. Try again in a minute.";
      case "auth/network-request-failed":
        return "Network error. Check your connection and try again.";
    }
  }
  return err instanceof Error ? err.message : String(err);
}

export function Login({ onSignedIn }: Props) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [claimId, setClaimId] = useState<string>("");
  const [legacyProfiles, setLegacyProfiles] = useState<Designer[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, [mode]);

  // Lazily load the existing designers for the claim picker the first time
  // the user opens the Sign up tab.
  useEffect(() => {
    if (mode !== "signup" || legacyProfiles.length > 0 || profilesLoading) return;
    setProfilesLoading(true);
    loadDesignerProfiles()
      .then((ps) => {
        // Only show the legacy seed profiles (their ids look like d-something),
        // not real users who've already signed up with a Firebase UID.
        setLegacyProfiles(ps.filter((p) => /^d-/.test(p.id)));
      })
      .catch((err) => console.warn("Couldn't load designer profiles", err))
      .finally(() => setProfilesLoading(false));
  }, [mode, legacyProfiles.length, profilesLoading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResetSent(false);
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError("Email and password are required.");
      return;
    }
    if (mode === "signup") {
      if (!name.trim()) {
        setError("Name is required.");
        return;
      }
      if (!trimmedEmail.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
        setError(`Use your @${ALLOWED_EMAIL_DOMAIN} email to sign up.`);
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === "signin") {
        const user = await signIn(trimmedEmail, password);
        const designer = await loadDesigner(user.uid);
        if (!designer) {
          throw new Error(
            "Your account exists but no Waypoint profile was found. Ask an admin to invite you again.",
          );
        }
        onSignedIn(designer.id);
      } else {
        const user = await signUp(trimmedEmail, password);
        if (claimId) {
          await claimDesignerProfile(claimId, user.uid, trimmedEmail);
        } else {
          await createDesignerProfile(user.uid, name.trim(), trimmedEmail);
        }
        onSignedIn(user.uid);
      }
    } catch (err) {
      console.error(err);
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email above first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetPassword(trimmed);
      setResetSent(true);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  // Auto-fill the claim picker's name when a profile is selected.
  function onClaimChange(id: string) {
    setClaimId(id);
    if (id) {
      const profile = legacyProfiles.find((p) => p.id === id);
      if (profile) setName(profile.name);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <img src={heroImage} alt="Waypoint" className="login-hero" />
        <div className="login-brand">Waypoint</div>

        <div className="auth-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={mode === "signin"}
            className={`auth-tab ${mode === "signin" ? "active" : ""}`}
            onClick={() => {
              setMode("signin");
              setError(null);
              setResetSent(false);
            }}
            type="button"
          >
            Sign in
          </button>
          <button
            role="tab"
            aria-selected={mode === "signup"}
            className={`auth-tab ${mode === "signup" ? "active" : ""}`}
            onClick={() => {
              setMode("signup");
              setError(null);
              setResetSent(false);
            }}
            type="button"
          >
            Sign up
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              ref={emailRef}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>

          {mode === "signup" && (
            <>
              <label className="field">
                <span>
                  {claimId ? "Display name (from existing profile)" : "Display name"}
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy || !!claimId}
                  placeholder="e.g. Jess Duguid"
                />
              </label>
              {legacyProfiles.length > 0 && (
                <label className="field">
                  <span>Claim an existing profile (optional)</span>
                  <select
                    value={claimId}
                    onChange={(e) => onClaimChange(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">— New profile —</option>
                    {legacyProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">
                    Picking your existing profile keeps all of that designer's
                    projects, comments, and notifications attached to you.
                  </p>
                </label>
              )}
            </>
          )}

          {error && <p className="login-error">{error}</p>}
          {resetSent && (
            <p className="muted small">
              If that email exists, a reset link is on its way.
            </p>
          )}

          <button className="primary login-submit" type="submit" disabled={busy}>
            {busy
              ? mode === "signin"
                ? "Signing in…"
                : "Creating account…"
              : mode === "signin"
                ? "Sign in"
                : "Sign up"}
          </button>

          {mode === "signin" && (
            <button
              type="button"
              className="link-btn auth-link"
              onClick={handleResetPassword}
              disabled={busy}
            >
              Forgot password?
            </button>
          )}
        </form>

        <p className="muted small login-foot">
          {mode === "signin"
            ? "New to Waypoint? Switch to Sign up to create your profile."
            : `Sign up uses your @${ALLOWED_EMAIL_DOMAIN} email.`}
        </p>
      </div>
    </div>
  );
}
