import { useEffect, useState } from "react";
import type { Designer, Workspace } from "../types";
import { changePassword } from "../firebase";
import { Avatar } from "./Avatar";

type Props = {
  currentDesigner: Designer;
  isAdmin: boolean;
  // Whether the current user is a super user. Super users (a superset that
  // includes admins) can promote / demote others via the Super users
  // section. Today isSuperUser is equivalent to isAdmin, but kept as a
  // separate prop in case the bootstrap-admin concept diverges later.
  isSuperUser: boolean;
  designers: Designer[];
  // Designers currently marked as super users — used to render their state
  // in the Super users section.
  superUsers: Designer[];
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
  isAdmin,
  isSuperUser,
  designers,
  superUsers,
  workspaces,
  onUpdateWorkspaceMembers,
  onUpdatePhotoUrl,
  onUpdateDesignerSuperUser,
  onClose,
}: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
            <ManageSuperUsers
              designers={designers}
              superUsers={superUsers}
              currentDesignerId={currentDesigner.id}
              onUpdateDesignerSuperUser={onUpdateDesignerSuperUser}
            />
          )}

          {isAdmin && (
            <ManageWorkspaces
              designers={designers}
              workspaces={workspaces}
              onUpdateWorkspaceMembers={onUpdateWorkspaceMembers}
            />
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

type ManageWorkspacesProps = {
  designers: Designer[];
  workspaces: Workspace[];
  onUpdateWorkspaceMembers: (
    workspaceId: string,
    memberIds: string[],
  ) => Promise<void>;
};

type ManageSuperUsersProps = {
  designers: Designer[];
  superUsers: Designer[];
  currentDesignerId: string;
  onUpdateDesignerSuperUser: (
    designerId: string,
    isSuperUser: boolean,
  ) => Promise<void>;
};

function ManageSuperUsers({
  designers,
  superUsers,
  currentDesignerId,
  onUpdateDesignerSuperUser,
}: ManageSuperUsersProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const superUserIds = new Set(superUsers.map((d) => d.id));

  async function toggle(designerId: string, next: boolean) {
    setBusyId(designerId);
    setError(null);
    try {
      await onUpdateDesignerSuperUser(designerId, next);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="modal-section">
      <h3>Super users</h3>
      <p className="muted small">
        Super users can see the by-designer analytics chart and be picked as
        reviewers on any project. Toggling someone here grants or removes
        that access immediately.
      </p>
      <div className="assignee-picker">
        {designers.map((d) => {
          const active = superUserIds.has(d.id);
          const isSelf = d.id === currentDesignerId;
          return (
            <button
              type="button"
              key={d.id}
              className={`assignee-chip ${active ? "active" : ""}`}
              onClick={() => toggle(d.id, !active)}
              disabled={busyId === d.id}
              title={
                isSelf && active
                  ? `Remove super-user status from yourself`
                  : active
                    ? `Remove ${d.name} as super user`
                    : `Make ${d.name} a super user`
              }
            >
              <Avatar
                designer={d}
                className="dot-avatar assignee-chip-avatar"
              />
              <span>{d.name.split(" ")[0]}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="login-error">{error}</p>}
    </section>
  );
}

function ManageWorkspaces({
  designers,
  workspaces,
  onUpdateWorkspaceMembers,
}: ManageWorkspacesProps) {
  return (
    <section className="modal-section">
      <h3>Manage workspaces</h3>
      <p className="muted small">
        Pick who's on each team. Everyone can see every workspace; this just
        controls who shows up in the Team columns and assignee pickers
        inside it. Leave a workspace empty to show every designer.
      </p>
      <div className="manage-workspaces">
        {workspaces.map((w) => (
          <WorkspaceMemberRow
            key={w.id}
            workspace={w}
            designers={designers}
            onSave={(ids) => onUpdateWorkspaceMembers(w.id, ids)}
          />
        ))}
      </div>
    </section>
  );
}

type WorkspaceMemberRowProps = {
  workspace: Workspace;
  designers: Designer[];
  onSave: (ids: string[]) => Promise<void>;
};

function WorkspaceMemberRow({
  workspace,
  designers,
  onSave,
}: WorkspaceMemberRowProps) {
  const initial = workspace.memberIds ?? [];
  const [selected, setSelected] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset local selection if the upstream workspace doc changes (e.g. a
  // concurrent edit from another admin).
  useEffect(() => {
    setSelected(workspace.memberIds ?? []);
  }, [workspace.memberIds]);

  const initialKey = initial.slice().sort().join(",");
  const selectedKey = selected.slice().sort().join(",");
  const dirty = initialKey !== selectedKey;

  function toggle(id: string) {
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave(selected);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workspace-member-row">
      <div className="workspace-member-head">
        <strong>{workspace.name}</strong>
        <span className="muted small">
          {selected.length === 0
            ? "Open to everyone"
            : `${selected.length} member${selected.length === 1 ? "" : "s"}`}
        </span>
      </div>
      <div className="assignee-picker">
        {designers.map((d) => {
          const active = selected.includes(d.id);
          return (
            <button
              type="button"
              key={d.id}
              className={`assignee-chip ${active ? "active" : ""}`}
              onClick={() => toggle(d.id)}
              disabled={busy}
            >
              <Avatar
                designer={d}
                className="dot-avatar assignee-chip-avatar"
              />
              <span>{d.name.split(" ")[0]}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="login-error">{error}</p>}
      <div className="section-actions">
        {saved && <span className="muted small">Saved</span>}
        <button
          className="primary"
          onClick={save}
          disabled={busy || !dirty}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
