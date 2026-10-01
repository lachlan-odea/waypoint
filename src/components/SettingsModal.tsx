import { useEffect, useMemo, useState } from "react";
import type { Designer, Hub, SocialConfig, Workspace } from "../types";
import { changePassword } from "../firebase";
import { Avatar } from "./Avatar";
import { ManageSocialModal } from "./ManageSocialModal";
import {
  DEFAULT_WORK_END_HOUR,
  DEFAULT_WORK_START_HOUR,
  hubClock,
  isValidTimeZone,
  isWithinWorkHours,
  localTimeZone,
  sortHubsByOffset,
  supportedTimeZones,
  timeZoneOffsetLabel,
} from "../timezones";

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
  // Configured office locations. Everyone reads them; only super users can
  // change them.
  hubs: Hub[];
  // Social calendar categories + company hashtags, and how many posts carry
  // each category label. Super users edit them from here.
  socialConfig: SocialConfig;
  socialCategoryUsage: Map<string, number>;
  onSaveSocialConfig: (config: SocialConfig) => Promise<void>;
  onRelabelSocialCategory: (oldLabel: string, newLabel: string) => Promise<number>;
  darkMode: boolean;
  onDarkModeChange: (enabled: boolean) => void;
  textSize: "small" | "default" | "large";
  onTextSizeChange: (size: "small" | "default" | "large") => void;
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
  onCreateDesigner: (name: string, email?: string) => Promise<void>;
  onDeleteDesigner: (designerId: string) => Promise<void>;
  onSaveHub: (hub: Hub) => Promise<void>;
  onDeleteHub: (hubId: string) => Promise<void>;
  onUpdateDesignerHub: (designerId: string, hubId: string) => Promise<void>;
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
  hubs,
  socialConfig,
  socialCategoryUsage,
  onSaveSocialConfig,
  onRelabelSocialCategory,
  darkMode,
  onDarkModeChange,
  textSize,
  onTextSizeChange,
  onUpdateWorkspaceMembers,
  onUpdatePhotoUrl,
  onUpdateDesignerSuperUser,
  onUpdateDesignerReviewer,
  onCreateDesigner,
  onDeleteDesigner,
  onSaveHub,
  onDeleteHub,
  onUpdateDesignerHub,
  onClose,
}: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manageUsersOpen, setManageUsersOpen] = useState(false);
  const [manageHubsOpen, setManageHubsOpen] = useState(false);
  const [manageSocialOpen, setManageSocialOpen] = useState(false);

  useEffect(() => {
    // Suspend the Settings Escape handler while a sub-modal is up — that
    // modal owns Escape until it's closed.
    if (manageUsersOpen || manageHubsOpen || manageSocialOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, manageUsersOpen, manageHubsOpen, manageSocialOpen]);

  const myHub = hubs.find((h) => h.id === currentDesigner.hubId);

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

          {isSuperUser && (
            <section className="modal-section">
              <h3>Social calendar</h3>
              <p className="muted small">
                The categories posts can be tagged with, and the company
                hashtags offered in the post editor. Shared by everyone who
                uses the calendar. Opens in a dedicated window.
              </p>
              <div className="social-summary">
                {socialConfig.categories.map((c) => (
                  <span
                    key={c.id}
                    className="soc-category"
                    style={{
                      color: c.color,
                      borderColor: c.color,
                      ["--category" as string]: c.color,
                    } as React.CSSProperties}
                    title={c.label}
                  >
                    {c.short}
                  </span>
                ))}
                {socialConfig.hashtags.length > 0 && (
                  <span className="muted small social-summary-tags">
                    {socialConfig.hashtags.map((h) => h.tag).join("  ")}
                  </span>
                )}
              </div>
              <div className="section-actions">
                <button
                  className="primary"
                  onClick={() => setManageSocialOpen(true)}
                >
                  Manage social calendar →
                </button>
              </div>
            </section>
          )}

          {isSuperUser && (
            <section className="modal-section">
              <h3>Locations &amp; time zones</h3>
              <p className="muted small">
                Locations are shared — adding one puts a live clock in every
                teammate's sidebar. Assign people to a location from Manage
                users. Opens in a dedicated window.
              </p>
              {hubs.length > 0 && (
                <div className="hub-summary">
                  {/* Same east-to-west order as the sidebar clocks. The
                      editable table below stays alphabetical — that one is
                      for finding a location, not reading the time. */}
                  {sortHubsByOffset(hubs).map((h) => (
                    <span key={h.id} className="hub-summary-item">
                      <strong>{h.name}</strong> {hubClock(h)}
                    </span>
                  ))}
                </div>
              )}
              <div className="section-actions">
                <button
                  className="primary"
                  onClick={() => setManageHubsOpen(true)}
                >
                  Manage locations →
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
            <p className="muted small">
              {myHub
                ? `Your location is ${myHub.name} (${myHub.timeZone}) — local time ${hubClock(myHub)}.`
                : hubs.length > 0
                  ? "You haven't been assigned a location yet, so teammates can't tell what time it is where you are. A super user can set one from Manage users."
                  : "No locations have been set up yet."}
            </p>
          </section>

          <ProfilePhotoSection
            currentDesigner={currentDesigner}
            onSave={onUpdatePhotoUrl}
          />

          <section className="modal-section">
            <h3>Display</h3>
            <div className="preference-group">
              <label className="preference-label">Theme</label>
              <div className="theme-row">
                <button
                  className={`theme-btn ${!darkMode ? "on" : ""}`}
                  onClick={() => onDarkModeChange(false)}
                  title="Light mode"
                >
                  Light
                </button>
                <button
                  className={`theme-btn ${darkMode ? "on" : ""}`}
                  onClick={() => onDarkModeChange(true)}
                  title="Dark mode"
                >
                  Dark
                </button>
              </div>
            </div>
            <div className="preference-group">
              <label className="preference-label">Text size</label>
              <div className="size-row">
                <button
                  className={`size-btn s1 ${textSize === "small" ? "on" : ""}`}
                  onClick={() => onTextSizeChange("small")}
                  title="Small"
                >
                  A
                </button>
                <button
                  className={`size-btn s2 ${textSize === "default" ? "on" : ""}`}
                  onClick={() => onTextSizeChange("default")}
                  title="Default"
                >
                  A
                </button>
                <button
                  className={`size-btn s3 ${textSize === "large" ? "on" : ""}`}
                  onClick={() => onTextSizeChange("large")}
                  title="Large"
                >
                  A
                </button>
              </div>
            </div>
          </section>

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
          hubs={hubs}
          currentDesignerId={currentDesigner.id}
          onUpdateDesignerSuperUser={onUpdateDesignerSuperUser}
          onUpdateDesignerReviewer={onUpdateDesignerReviewer}
          onUpdateWorkspaceMembers={onUpdateWorkspaceMembers}
          onUpdateDesignerHub={onUpdateDesignerHub}
          onCreateDesigner={onCreateDesigner}
          onDeleteDesigner={onDeleteDesigner}
          onClose={() => setManageUsersOpen(false)}
        />
      )}

      {manageHubsOpen && (
        <ManageHubsModal
          hubs={hubs}
          designers={designers}
          onSaveHub={onSaveHub}
          onDeleteHub={onDeleteHub}
          onClose={() => setManageHubsOpen(false)}
        />
      )}

      {manageSocialOpen && (
        <ManageSocialModal
          config={socialConfig}
          categoryUsage={socialCategoryUsage}
          onSave={onSaveSocialConfig}
          onRelabelCategory={onRelabelSocialCategory}
          onClose={() => setManageSocialOpen(false)}
        />
      )}
    </div>
  );
}

type HubRowProps = {
  hub: Hub;
  zones: string[];
  assignedCount: number;
  busy: boolean;
  deleting: boolean;
  onPatch: (patch: Partial<Hub>) => Promise<void> | void;
  onDelete: () => void;
};

function clampHour(value: string): number {
  return Math.min(23, Math.max(0, Number(value) || 0));
}

// One editable location. The free-text and numeric fields keep a local draft
// and only write on blur or Enter — writing per keystroke would hammer a
// collection every client subscribes to, and because the input's value comes
// back from that live snapshot, the round-trip would fight the cursor
// mid-word. The zone dropdown commits immediately: it's a single discrete
// choice, so there's nothing to interrupt.
function HubRow({
  hub,
  zones,
  assignedCount,
  busy,
  deleting,
  onPatch,
  onDelete,
}: HubRowProps) {
  const [name, setName] = useState(hub.name);
  const [start, setStart] = useState(
    String(hub.workStartHour ?? DEFAULT_WORK_START_HOUR),
  );
  const [end, setEnd] = useState(
    String(hub.workEndHour ?? DEFAULT_WORK_END_HOUR),
  );

  function commitName() {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(hub.name);
      return;
    }
    if (trimmed !== hub.name) void onPatch({ name: trimmed });
  }

  function commitHours() {
    const nextStart = clampHour(start);
    const nextEnd = clampHour(end);
    setStart(String(nextStart));
    setEnd(String(nextEnd));
    if (
      nextStart !== (hub.workStartHour ?? DEFAULT_WORK_START_HOUR) ||
      nextEnd !== (hub.workEndHour ?? DEFAULT_WORK_END_HOUR)
    ) {
      void onPatch({ workStartHour: nextStart, workEndHour: nextEnd });
    }
  }

  // A zone saved from another browser may not be in this one's enumerated
  // list; keep it selectable so editing anything else can't silently rewrite
  // the zone to the first option.
  const zoneOptions = zones.includes(hub.timeZone)
    ? zones
    : [hub.timeZone, ...zones];

  return (
    <div className="manage-hub-row">
      <div className="manage-hub-main">
        <input
          className="manage-hub-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setName(hub.name);
          }}
          disabled={busy}
          aria-label={`Name for ${hub.name}`}
        />
        <select
          value={hub.timeZone}
          onChange={(e) => void onPatch({ timeZone: e.target.value })}
          disabled={busy}
          aria-label={`Time zone for ${hub.name}`}
        >
          {zoneOptions.map((z) => (
            <option key={z} value={z}>
              {z} {timeZoneOffsetLabel(z)}
            </option>
          ))}
        </select>
      </div>
      <div className="manage-hub-hours">
        <span className="manage-user-chip-label">Working</span>
        <input
          type="number"
          min={0}
          max={23}
          value={start}
          onChange={(e) => setStart(e.target.value)}
          onBlur={commitHours}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          disabled={busy}
          aria-label={`Work start hour for ${hub.name}`}
        />
        <span className="muted small">to</span>
        <input
          type="number"
          min={0}
          max={23}
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          onBlur={commitHours}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          disabled={busy}
          aria-label={`Work end hour for ${hub.name}`}
        />
      </div>
      <div className="manage-hub-now">
        <span className={isWithinWorkHours(hub) ? "" : "manage-hub-offhours"}>
          {hubClock(hub)}
        </span>
        <span className="muted small">
          {assignedCount} {assignedCount === 1 ? "person" : "people"}
        </span>
      </div>
      <button
        type="button"
        className="manage-user-delete"
        onClick={onDelete}
        disabled={deleting}
        title={`Remove ${hub.name}`}
      >
        {deleting ? "Removing…" : "Remove"}
      </button>
    </div>
  );
}

type ManageHubsModalProps = {
  hubs: Hub[];
  designers: Designer[];
  onSaveHub: (hub: Hub) => Promise<void>;
  onDeleteHub: (hubId: string) => Promise<void>;
  onClose: () => void;
};

function slugifyHubId(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `hub-${Date.now()}`
  );
}

// Super-user CRUD over the shared location list. One row per location with
// its name, IANA zone and working hours editable in place, plus an add form.
function ManageHubsModal({
  hubs,
  designers,
  onSaveHub,
  onDeleteHub,
  onClose,
}: ManageHubsModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newZone, setNewZone] = useState(() => localTimeZone());

  // Enumerated once — the IANA list runs to ~400 entries and never changes
  // during a session.
  const zones = useMemo(() => supportedTimeZones(), []);

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

  function patchHub(hub: Hub, patch: Partial<Hub>) {
    return run(`hub:${hub.id}`, () => onSaveHub({ ...hub, ...patch }));
  }

  async function submitNew() {
    const name = newName.trim();
    if (!name) return;
    if (!isValidTimeZone(newZone)) {
      setError(`"${newZone}" isn't a time zone this browser recognises.`);
      return;
    }
    const id = slugifyHubId(name);
    if (hubs.some((h) => h.id === id)) {
      setError(`A location called "${name}" already exists.`);
      return;
    }
    await run("create", () =>
      onSaveHub({
        id,
        name,
        timeZone: newZone,
        workStartHour: DEFAULT_WORK_START_HOUR,
        workEndHour: DEFAULT_WORK_END_HOUR,
      }),
    );
    setNewName("");
    setAdding(false);
  }

  function confirmDelete(hub: Hub) {
    const assigned = designers.filter((d) => d.hubId === hub.id);
    const warning = assigned.length
      ? `\n\n${assigned.length} ${assigned.length === 1 ? "person is" : "people are"} assigned to it (${assigned
          .map((d) => d.name)
          .join(", ")}). They'll become unassigned.`
      : "";
    const ok = window.confirm(
      `Remove ${hub.name}? Its clock disappears from everyone's sidebar.${warning}`,
    );
    if (!ok) return;
    void run(`delete:${hub.id}`, () => onDeleteHub(hub.id));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 className="modal-title-static">Locations &amp; time zones</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">
          <p className="muted small" style={{ marginTop: 0 }}>
            Each location stores an IANA time zone, so daylight saving is
            handled for you — Sydney and Chicago sit 15 to 17 hours apart
            depending on the month. Working hours only decide when a clock is
            greyed out as “outside working hours”; nothing is ever blocked.
          </p>
          <p className="muted small">
            Due dates stay plain calendar dates. The 20th is the 20th in every
            location — what differs is when the day starts, which is why a
            countdown can honestly disagree by one between offices.
          </p>

          <div className="manage-users-toolbar">
            {!adding ? (
              <button
                className="primary"
                onClick={() => setAdding(true)}
                disabled={busyKey === "create"}
              >
                + Add location
              </button>
            ) : (
              <div className="manage-users-add">
                <input
                  autoFocus
                  type="text"
                  placeholder="Location name, e.g. London"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newName.trim()) void submitNew();
                    if (e.key === "Escape") setAdding(false);
                  }}
                  disabled={busyKey === "create"}
                />
                <select
                  value={newZone}
                  onChange={(e) => setNewZone(e.target.value)}
                  disabled={busyKey === "create"}
                >
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z} {timeZoneOffsetLabel(z)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    setAdding(false);
                    setNewName("");
                  }}
                  disabled={busyKey === "create"}
                >
                  Cancel
                </button>
                <button
                  className="primary"
                  onClick={submitNew}
                  disabled={!newName.trim() || busyKey === "create"}
                >
                  {busyKey === "create" ? "Adding…" : "Add"}
                </button>
              </div>
            )}
          </div>

          {hubs.length === 0 ? (
            <p className="muted small">
              No locations yet. Add one to put a clock in everyone's sidebar.
            </p>
          ) : (
            <div className="manage-hubs">
              {hubs.map((hub) => (
                <HubRow
                  key={hub.id}
                  hub={hub}
                  zones={zones}
                  assignedCount={
                    designers.filter((d) => d.hubId === hub.id).length
                  }
                  busy={busyKey === `hub:${hub.id}`}
                  deleting={busyKey === `delete:${hub.id}`}
                  onPatch={(patch) => patchHub(hub, patch)}
                  onDelete={() => confirmDelete(hub)}
                />
              ))}
            </div>
          )}
          {error && <p className="login-error">{error}</p>}
        </div>
        <footer className="modal-foot">
          <button onClick={onClose}>Done</button>
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

type ManageUsersModalProps = {
  designers: Designer[];
  superUsers: Designer[];
  reviewers: Designer[];
  workspaces: Workspace[];
  hubs: Hub[];
  currentDesignerId: string;
  onUpdateDesignerHub: (designerId: string, hubId: string) => Promise<void>;
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
  onCreateDesigner: (name: string, email?: string) => Promise<void>;
  onDeleteDesigner: (designerId: string) => Promise<void>;
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
  hubs,
  currentDesignerId,
  onUpdateDesignerHub,
  onUpdateDesignerSuperUser,
  onUpdateDesignerReviewer,
  onUpdateWorkspaceMembers,
  onCreateDesigner,
  onDeleteDesigner,
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
  // Inline "Add user" form state. Collapsed by default; expands when the
  // admin clicks the + Add user button.
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");

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

  async function submitNew() {
    const name = newName.trim();
    if (!name) return;
    await run("create", () => onCreateDesigner(name, newEmail.trim() || undefined));
    setNewName("");
    setNewEmail("");
    setAdding(false);
  }

  function cancelNew() {
    setNewName("");
    setNewEmail("");
    setAdding(false);
  }

  function confirmDelete(designerId: string, name: string) {
    const ok = window.confirm(
      `Delete ${name}? Their profile is removed but any existing project assignments stay referenced by their ID. They can sign up again as a new user.`,
    );
    if (!ok) return;
    void run(`delete:${designerId}`, () => onDeleteDesigner(designerId));
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
          <div className="manage-users-toolbar">
            {!adding ? (
              <button
                className="primary"
                onClick={() => setAdding(true)}
                disabled={busyKey === "create"}
              >
                + Add user
              </button>
            ) : (
              <div className="manage-users-add">
                <input
                  autoFocus
                  type="text"
                  placeholder="Full name (required)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newName.trim()) void submitNew();
                    if (e.key === "Escape") cancelNew();
                  }}
                  disabled={busyKey === "create"}
                />
                <input
                  type="email"
                  placeholder="Email (optional)"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newName.trim()) void submitNew();
                    if (e.key === "Escape") cancelNew();
                  }}
                  disabled={busyKey === "create"}
                />
                <button onClick={cancelNew} disabled={busyKey === "create"}>
                  Cancel
                </button>
                <button
                  className="primary"
                  onClick={submitNew}
                  disabled={!newName.trim() || busyKey === "create"}
                >
                  {busyKey === "create" ? "Adding…" : "Add"}
                </button>
              </div>
            )}
          </div>
          <div className="manage-users">
        {designers.map((d) => {
          const isSelf = d.id === currentDesignerId;
          const isSuper = superUserIds.has(d.id);
          const isReviewerActive = reviewerIds.has(d.id);
          const isPlaceholder = d.id.startsWith("placeholder-");
          return (
            <div key={d.id} className="manage-user-row">
              <div className="manage-user-identity">
                <Avatar designer={d} />
                <div>
                  <div className="manage-user-name">{d.name}</div>
                  <div className="muted small manage-user-email">
                    {d.email
                      ? d.email
                      : isPlaceholder
                        ? "Pending sign-in"
                        : "—"}
                  </div>
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
                {hubs.length > 0 && (
                  <div className="manage-user-chip-group">
                    <span className="manage-user-chip-label">Location</span>
                    {hubs.map((h) => {
                      const active = d.hubId === h.id;
                      const key = `hub:${h.id}:${d.id}`;
                      return (
                        <button
                          type="button"
                          key={h.id}
                          className={`assignee-chip ${active ? "active" : ""}`}
                          // Clicking the active location clears it, so
                          // "no location" stays reachable without a
                          // separate control.
                          onClick={() =>
                            run(key, () =>
                              onUpdateDesignerHub(d.id, active ? "" : h.id),
                            )
                          }
                          disabled={busyKey === key}
                          title={
                            active
                              ? `Clear ${d.name}'s location`
                              : `Put ${d.name} in ${h.name} (${h.timeZone})`
                          }
                        >
                          {h.name}
                        </button>
                      );
                    })}
                    {d.hubId && (
                      <span className="muted small manage-user-localtime">
                        {(() => {
                          const hub = hubs.find((h) => h.id === d.hubId);
                          if (!hub) return "";
                          return `${hubClock(hub)}${
                            isWithinWorkHours(hub) ? "" : " · outside hours"
                          }`;
                        })()}
                      </span>
                    )}
                  </div>
                )}
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
              <button
                type="button"
                className="manage-user-delete"
                onClick={() => confirmDelete(d.id, d.name)}
                disabled={isSelf || busyKey === `delete:${d.id}`}
                title={
                  isSelf
                    ? "You can't delete your own account"
                    : `Delete ${d.name}`
                }
              >
                {busyKey === `delete:${d.id}` ? "Deleting…" : "Delete"}
              </button>
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
