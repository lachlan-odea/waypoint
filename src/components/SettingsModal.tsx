import { useEffect, useState } from "react";
import type { Designer, Workspace } from "../types";
import { changePassword } from "../firebase";
import { Avatar } from "./Avatar";

type Props = {
  currentDesigner: Designer;
  // Whether the current user is a super user. Gates the Manage users
  // section (the only admin surface in Settings).
  isSuperUser: boolean;
  designers: Designer[];
  // Designers currently marked as super users — used to render their state
  // in the Super users section.
  superUsers: Designer[];
  // Designers currently marked as reviewers — used to render their state
  // in the Reviewers section.
  reviewers: Designer[];
  workspaces: Workspace[];
  onUpdateWorkspaceMembers: (
    workspaceId: string,
    memberIds: string[],
  ) => Promise<void>;
  onUpdatePhotoUrl: (url: string) => Promise<void>;
  onUpdateDesignerSuperUser: (
    designerId: string,
    isSuperUser: boolean,
  ) => Promise<void>;
  onUpdateDesignerReviewer: (
    designerId: string,
    isReviewer: boolean,
  ) => Promise<void>;
  onClose: () => void;
};

function friendlyError(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: string }).code;
    switch (code) {
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Current password is incorrect.";
      case "auth/weak-password":
        return "New password needs to be at least 6 characters.";
      case "auth/requires-recent-login":
        return "Please sign out and back in, then try again.";
    }
  }
  return err instanceof Error ? err.message : String(err);
}

export function SettingsModal({
  currentDesigner,
  isSuperUser,
  designers,
  superUsers,
  reviewers,
  workspaces,
  onUpdateWorkspaceMembers,
  onUpdatePhotoUrl,
  onUpdateDesignerSuperUser,
  onUpdateDesignerReviewer,
  onClose,
}: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manageUsersOpen, setManageUsersOpen] = useState(false);

  useEffect(() => {
    // Suspend the Settings Escape handler while the Manage users sub-modal
    // is up — that modal owns Escape until it's closed.
    if (manageUsersOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, manageUsersOpen]);

  async function savePassword() {
    setError(null);
    if (nextPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (nextPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }
    setBusy(true);
    try {
      await changePassword(currentPassword, nextPassword);
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      console.error(err);
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal ${isSuperUser ? "" : "modal-narrow"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 className="modal-title-static">Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal-body">
          {isSuperUser && (
            <section className="modal-section">
              <h3>Manage users</h3>
              <p className="muted small">
                Set roles (Super user / Reviewer) and team membership for
                every designer on the platform. Opens in a dedicated window.
              </p>
              <div className="section-actions">
                <button
                  className="primary"
                  onClick={() => setManageUsersOpen(true)}
                >
                  Manage users →
                </button>
              </div>
            </section>
          )}

          <section className="modal-section">
            <h3>Account</h3>
            <p className="muted small">
              Signed in as <strong>{currentDesigner.name}</strong>
              {currentDesigner.email ? ` · ${currentDesigner.email}` : ""}
            </p>
          </section>

          <ProfilePhotoSection
            currentDesigner={currentDesigner}
            onSave={onUpdatePhotoUrl}
          />

          <section className="modal-section">
            <h3>Change password</h3>
            <label className="field">
              <span>Current password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setError(null);
                }}
                disabled={busy}
              />
            </label>
            <label className="field">
              <span>New password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={nextPassword}
                onChange={(e) => {
                  setNextPassword(e.target.value);
                  setError(null);
                }}
                disabled={busy}
              />
            </label>
            <label className="field">
              <span>Confirm new password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && !busy && savePassword()}
                disabled={busy}
              />
            </label>
            {error && <p className="login-error">{error}</p>}
            <div className="section-actions">
              {saved && <span className="muted small">Password updated</span>}
              <button className="primary" onClick={savePassword} disabled={busy}>
                {busy ? "Saving…" : "Save password"}
              </button>
            </div>
          </section>
        </div>

        <footer className="modal-foot">
          <button onClick={onClose}>Close</button>
        </footer>
      </div>

      {manageUsersOpen && (
        <ManageUsersModal
          designers={designers}
          superUsers={superUsers}
          reviewers={reviewers}
          workspaces={workspaces}
          currentDesignerId={currentDesigner.id}
          onUpdateDesignerSuperUser={onUpdateDesignerSuperUser}
          onUpdateDesignerReviewer={onUpdateDesignerReviewer}
          onUpdateWorkspaceMembers={onUpdateWorkspaceMembers}
          onClose={() => setManageUsersOpen(false)}
        />
      )}
    </div>
  );
}

type ProfilePhotoSectionProps = {
  currentDesigner: Designer;
  onSave: (url: string) => Promise<void>;
};

function ProfilePhotoSection({
  currentDesigner,
  onSave,
}: ProfilePhotoSectionProps) {
  const initial = currentDesigner.photoUrl ?? "";
  const [url, setUrl] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync if the upstream doc changes (e.g. saved on another tab).
  useEffect(() => {
    setUrl(currentDesigner.photoUrl ?? "");
  }, [currentDesigner.photoUrl]);

  const trimmed = url.trim();
  const dirty = trimmed !== (currentDesigner.photoUrl ?? "");

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave(trimmed);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  // Preview reflects the as-typed URL so you can see whether your link works
  // before saving. Falls back to the saved avatar (or initials) if blank.
  const previewDesigner: Designer = {
    ...currentDesigner,
    photoUrl: trimmed || undefined,
  };

  return (
    <section className="modal-section">
      <h3>Profile photo</h3>
      <p className="muted small">
        Paste a link to a hosted headshot (e.g. a public OneDrive or
        SharePoint image URL). Leave blank to fall back to your initials.
      </p>
      <div className="profile-photo-row">
        <Avatar
          key={previewDesigner.photoUrl ?? "initials"}
          designer={previewDesigner}
          className="dot-avatar profile-photo-preview"
        />
        <label className="field profile-photo-field">
          <span>Photo URL</span>
          <input
            type="url"
            placeholder="https://…"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && dirty && !busy && save()}
            disabled={busy}
          />
        </label>
      </div>
      {error && <p className="login-error">{error}</p>}
      <div className="section-actions">
        {saved && <span className="muted small">Saved</span>}
        <button
          className="primary"
          onClick={save}
          disabled={busy || !dirty}
        >
          {busy ? "Saving…" : "Save photo"}
        </button>
      </div>
    </section>
  );
}

type ManageUsersModalProps = {
  designers: Designer[];
  superUsers: Designer[];
  reviewers: Designer[];
  workspaces: Workspace[];
  currentDesignerId: string;
  onUpdateDesignerSuperUser: (
    designerId: string,
    isSuperUser: boolean,
  ) => Promise<void>;
  onUpdateDesignerReviewer: (
    designerId: string,
    isReviewer: boolean,
  ) => Promise<void>;
  onUpdateWorkspaceMembers: (
    workspaceId: string,
    memberIds: string[],
  ) => Promise<void>;
  onClose: () => void;
};

// Dedicated sub-modal that opens on top of Settings. One row per designer,
// with Role chips (Super user / Reviewer) stacked above the Teams chips
// for every workspace. Replaces the trio of ManageSuperUsers /
// ManageReviewers / ManageWorkspaces sections that used to live inline.
function ManageUsersModal({
  designers,
  superUsers,
  reviewers,
  workspaces,
  currentDesignerId,
  onUpdateDesignerSuperUser,
  onUpdateDesignerReviewer,
  onUpdateWorkspaceMembers,
  onClose,
}: ManageUsersModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // A composite busy key like "super:abc123" or "team:design:abc123" so
  // each chip can show its own loading state without locking the entire
  // row.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const superUserIds = new Set(superUsers.map((d) => d.id));
  const reviewerIds = new Set(reviewers.map((d) => d.id));
  const workspaceMembership = new Map(
    workspaces.map((w) => [w.id, new Set(w.memberIds ?? [])]),
  );

  async function run<T>(key: string, op: () => Promise<T>) {
    setBusyKey(key);
    setError(null);
    try {
      await op();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }

  function toggleTeamMembership(workspace: Workspace, designerId: string) {
    const current = workspace.memberIds ?? [];
    const next = current.includes(designerId)
      ? current.filter((x) => x !== designerId)
      : [...current, designerId];
    return run(`team:${workspace.id}:${designerId}`, () =>
      onUpdateWorkspaceMembers(workspace.id, next),
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 className="modal-title-static">Manage users</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">
          <p className="muted small" style={{ marginTop: 0 }}>
            One row per designer. Toggle roles (Super user, Reviewer) and
            team membership independently — anyone can be assigned to a
            project regardless of team, but only team members appear as
            columns on that team's board. A team with no members chosen
            stays open to everyone.
          </p>
          <div className="manage-users">
        {designers.map((d) => {
          const isSelf = d.id === currentDesignerId;
          const isSuper = superUserIds.has(d.id);
          const isReviewerActive = reviewerIds.has(d.id);
          return (
            <div key={d.id} className="manage-user-row">
              <div className="manage-user-identity">
                <Avatar designer={d} />
                <div>
                  <div className="manage-user-name">{d.name}</div>
                  {d.email && (
                    <div className="muted small manage-user-email">
                      {d.email}
                    </div>
                  )}
                </div>
              </div>
              <div className="manage-user-chips">
                <div className="manage-user-chip-group">
                  <span className="manage-user-chip-label">Role</span>
                  <button
                    type="button"
                    className={`assignee-chip ${isSuper ? "active" : ""}`}
                    onClick={() =>
                      run(`super:${d.id}`, () =>
                        onUpdateDesignerSuperUser(d.id, !isSuper),
                      )
                    }
                    disabled={busyKey === `super:${d.id}`}
                    title={
                      isSelf && isSuper
                        ? "Remove super-user status from yourself"
                        : isSuper
                          ? `Remove ${d.name} as super user`
                          : `Make ${d.name} a super user`
                    }
                  >
                    Super user
                  </button>
                  <button
                    type="button"
                    className={`assignee-chip ${isReviewerActive ? "active" : ""}`}
                    onClick={() =>
                      run(`reviewer:${d.id}`, () =>
                        onUpdateDesignerReviewer(d.id, !isReviewerActive),
                      )
                    }
                    disabled={busyKey === `reviewer:${d.id}`}
                    title={
                      isReviewerActive
                        ? `Remove ${d.name} as reviewer`
                        : `Make ${d.name} a reviewer`
                    }
                  >
                    Reviewer
                  </button>
                </div>
                <div className="manage-user-chip-group">
                  <span className="manage-user-chip-label">Teams</span>
                  {workspaces.map((w) => {
                    const active =
                      workspaceMembership.get(w.id)?.has(d.id) ?? false;
                    const key = `team:${w.id}:${d.id}`;
                    return (
                      <button
                        type="button"
                        key={w.id}
                        className={`assignee-chip ${active ? "active" : ""}`}
                        onClick={() => toggleTeamMembership(w, d.id)}
                        disabled={busyKey === key}
                        title={
                          active
                            ? `Remove ${d.name} from ${w.name}`
                            : `Add ${d.name} to ${w.name}`
                        }
                      >
                        {w.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
          </div>
          {error && <p className="login-error">{error}</p>}
        </div>
        <footer className="modal-foot">
          <button onClick={onClose}>Done</button>
        </footer>
      </div>
    </div>
  );
}
