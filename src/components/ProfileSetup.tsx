import { useEffect, useState } from "react";
import type { Designer } from "../types";
import {
  claimDesignerProfile,
  createDesignerProfile,
  loadDesignerProfiles,
} from "../firestore";
import { signOut } from "../firebase";

const heroImage = `${import.meta.env.BASE_URL}hero.png`;

type Props = {
  uid: string;
  email: string;
};

function friendlyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// Shown when a user is signed in via Firebase Auth but their Designer doc
// hasn't been created yet — usually because the signup batch lost a race
// with the auth-state listener, or signup was interrupted mid-flow. Lets
// them either claim a legacy seed profile (Jess, Oliver, etc.) or create
// a fresh one. Once the doc lands in Firestore, the subscription in
// App.tsx unmounts this and shows the workspace.
export function ProfileSetup({ uid, email }: Props) {
  const [legacyProfiles, setLegacyProfiles] = useState<Designer[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimId, setClaimId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDesignerProfiles()
      .then((ps) => {
        setLegacyProfiles(ps.filter((p) => /^d-/.test(p.id)));
      })
      .catch((err) => {
        console.warn("Couldn't load designer profiles", err);
      })
      .finally(() => setLoading(false));
  }, []);

  function onClaimChange(id: string) {
    setClaimId(id);
    const profile = legacyProfiles.find((p) => p.id === id);
    if (profile) setName(profile.name);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!claimId && !name.trim()) {
      setError("Pick a profile to claim or enter your display name.");
      return;
    }
    setBusy(true);
    try {
      if (claimId) {
        await claimDesignerProfile(claimId, uid, email);
      } else {
        await createDesignerProfile(uid, name.trim(), email);
      }
      // App.tsx's subscription will pick up the new doc and unmount this.
    } catch (err) {
      console.error(err);
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <img src={heroImage} alt="Waypoint" className="login-hero" />
        <div className="login-brand">Waypoint</div>
        <h1 className="login-title">Finish setting up your profile</h1>
        <p className="muted">
          You're signed in as <strong>{email}</strong>. Pick the designer
          profile you're claiming, or create a fresh one.
        </p>

        <form className="auth-form" onSubmit={submit}>
          {loading ? (
            <p className="muted small">Loading profiles…</p>
          ) : (
            <>
              {legacyProfiles.length > 0 && (
                <label className="field">
                  <span>Claim an existing profile</span>
                  <select
                    value={claimId}
                    onChange={(e) => onClaimChange(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">— Create a new profile instead —</option>
                    {legacyProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">
                    Picking your existing profile reattaches all of that
                    designer's projects, comments, and notifications to you.
                  </p>
                </label>
              )}
              <label className="field">
                <span>
                  {claimId
                    ? "Display name (from existing profile)"
                    : "Display name"}
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy || !!claimId}
                  placeholder="e.g. Jess Duguid"
                />
              </label>
            </>
          )}

          {error && <p className="login-error">{error}</p>}

          <button
            className="primary login-submit"
            type="submit"
            disabled={busy || loading}
          >
            {busy ? "Setting up…" : claimId ? "Claim profile" : "Create profile"}
          </button>

          <button
            type="button"
            className="link-btn auth-link"
            onClick={() => signOut().catch(console.error)}
            disabled={busy}
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
