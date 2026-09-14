import { useEffect, useMemo, useState } from "react";
import type { Designer, SocialPost } from "../types";
import { SOCIAL_CHANNELS, SOCIAL_POST_STATUSES } from "../constants";
import { todayIso } from "../dates";
import { readDraggedSocialPostId } from "../dnd";
import {
  deleteSocialPost,
  seedSocialPostsIfMissing,
  setSocialPost,
  subscribeSocialPosts,
} from "../firestore";
import { socialPostTitle } from "../socialPosts";
import { SocialPostCard } from "./SocialPostCard";
import { SocialPostModal } from "./SocialPostModal";

type Props = {
  // Only used for owner suggestions in the post editor.
  designers: Designer[];
};

type Editing =
  | { mode: "create"; initial: Partial<SocialPost> }
  | { mode: "edit"; post: SocialPost };

// Drop-target id for the Unscheduled tray. Not a date.
const UNSCHEDULED = "__unscheduled__";

// Stable stand-in for "no posts yet" so the memos below don't see a fresh
// array (and recompute) on every render before the first snapshot.
const NO_POSTS: SocialPost[] = [];

// The one failure a teammate can't do anything about from inside the app:
// the /socialPosts rules haven't been deployed yet, so Firestore refuses
// every read and write. Say that plainly rather than echoing the SDK.
function isPermissionDenied(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code ?? "";
  const message = err instanceof Error ? err.message : String(err);
  return code === "permission-denied" || /insufficient permissions/i.test(message);
}

function describeError(prefix: string, err: unknown): string {
  if (isPermissionDenied(err)) {
    return `${prefix}: Firestore is refusing access to the social calendar. The rules in firestore.rules (which add the socialPosts collection) need deploying to the wtg-waypoint project — Firebase console → Firestore → Rules, or “firebase deploy --only firestore:rules”.`;
  }
  return `${prefix}: ${err instanceof Error ? err.message : String(err)}`;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// YYYY-MM ± n months.
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

// The cells of a Monday-first month grid: null for the padding before the
// 1st and after the last day, otherwise the YYYY-MM-DD of that cell. Always
// a whole number of weeks. Monday-first matches the spreadsheet this
// calendar replaced, and the team's working week.
function monthGrid(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const leading = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = Array(leading).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${month}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function isWeekend(iso: string): boolean {
  const day = new Date(`${iso}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

// Stable card order inside a day: channel, then topic — so the two brand
// accounts' posts group together when both go out on the same day.
function sortPosts(a: SocialPost, b: SocialPost): number {
  const c = a.channel.localeCompare(b.channel);
  if (c !== 0) return c;
  return socialPostTitle(a).localeCompare(socialPostTitle(b));
}

export function SocialCalendar({ designers }: Props) {
  // null until the first snapshot lands, so the empty state can't flash
  // before the import has been read.
  const [posts, setPosts] = useState<SocialPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  // "" means every channel.
  const [channelFilter, setChannelFilter] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"calendar" | "library">("calendar");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [dropOver, setDropOver] = useState<string | null>(null);
  // The in-view import. App runs the same seed on sign-in, but silently;
  // this is the retry you can see, for when that first attempt was refused.
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);

  useEffect(() => {
    return subscribeSocialPosts(
      (next) => {
        setPosts(next);
        setError(null);
      },
      (err) => {
        console.error(err);
        setError(describeError("Couldn't load the social calendar", err));
      },
    );
  }, []);

  function writeError(err: unknown) {
    console.error("Social post write failed", err);
    setError(describeError("Save failed", err));
  }

  function importSpreadsheet() {
    setImporting(true);
    setImportNote(null);
    seedSocialPostsIfMissing()
      .then((n) => {
        setImportNote(
          n === 0
            ? "Nothing imported — the calendar already has posts."
            : `Imported ${n} posts from the 2026 spreadsheet.`,
        );
      })
      .catch((err) => {
        console.error("Social calendar import failed", err);
        setError(describeError("Import failed", err));
      })
      .finally(() => setImporting(false));
  }

  const all = posts ?? NO_POSTS;

  // Filter pills: the built-in channels first, then anything else in use.
  const channels = useMemo(() => {
    const seen = new Set<string>(SOCIAL_CHANNELS);
    const extra = all
      .map((p) => p.channel.trim())
      .filter((c) => c && !seen.has(c));
    return [...SOCIAL_CHANNELS, ...Array.from(new Set(extra)).sort()];
  }, [all]);

  const owners = useMemo(() => {
    const names = new Set<string>();
    all.forEach((p) => p.owner.trim() && names.add(p.owner.trim()));
    designers.forEach((d) => names.add(d.name));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [all, designers]);

  const q = query.trim().toLowerCase();

  // The channel pill and search box apply to both tabs.
  const filtered = useMemo(
    () =>
      all.filter((p) => {
        if (channelFilter && p.channel.trim() !== channelFilter) return false;
        if (!q) return true;
        return [p.topic, p.copy, p.owner, p.notes, p.channel]
          .join(" ")
          .toLowerCase()
          .includes(q);
      }),
    [all, channelFilter, q],
  );

  // Everything that belongs to the month in view: dated posts by their date,
  // undated ones by the month they were filed under. Undated evergreen posts
  // are the library's, not the month's.
  const monthPosts = useMemo(
    () =>
      filtered.filter((p) => {
        if (p.date) return p.date.slice(0, 7) === month;
        return !p.evergreen && p.month === month;
      }),
    [filtered, month],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, SocialPost[]>();
    monthPosts.forEach((p) => {
      if (!p.date) return;
      const list = map.get(p.date) ?? [];
      list.push(p);
      map.set(p.date, list);
    });
    map.forEach((list) => list.sort(sortPosts));
    return map;
  }, [monthPosts]);

  const unscheduled = useMemo(
    () => monthPosts.filter((p) => !p.date).sort(sortPosts),
    [monthPosts],
  );

  const library = useMemo(
    () =>
      filtered
        .filter((p) => p.evergreen)
        // Newest month first, so recently written copy is nearest the top.
        .sort((a, b) => b.month.localeCompare(a.month) || sortPosts(a, b)),
    [filtered],
  );

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    monthPosts.forEach((p) =>
      counts.set(p.status, (counts.get(p.status) ?? 0) + 1),
    );
    return counts;
  }, [monthPosts]);

  const cells = useMemo(() => monthGrid(month), [month]);
  const today = todayIso();

  // ── mutations ──────────────────────────────────────────────────────────

  function savePost(post: SocialPost) {
    setSocialPost(post).catch(writeError);
    setEditing(null);
    // Follow a post that was saved onto a different month, or the modal
    // closing would look like the post vanished.
    if (post.date && post.date.slice(0, 7) !== month) {
      setMonth(post.date.slice(0, 7));
      setTab("calendar");
    }
  }

  function removePost(id: string) {
    deleteSocialPost(id).catch(writeError);
    setEditing(null);
  }

  // Drag-to-reschedule. Dropping on the tray clears the date but keeps the
  // post in the month being viewed.
  function reschedule(id: string, date: string) {
    const post = all.find((p) => p.id === id);
    if (!post || post.date === date) return;
    setSocialPost({
      ...post,
      date,
      month: date ? date.slice(0, 7) : month,
    }).catch(writeError);
  }

  function openCreate(initial: Partial<SocialPost>) {
    setEditing({ mode: "create", initial: { month, ...initial } });
  }

  // Reusing an evergreen post means a fresh, undated draft carrying its copy.
  // The library entry itself is left alone so it can be reused again.
  function reuse(post: SocialPost) {
    openCreate({
      channel: post.channel,
      topic: post.topic,
      copy: post.copy,
      asset: post.asset,
      ctaLink: post.ctaLink,
      status: "draft",
      evergreen: false,
      notes: `Reused from the evergreen library (${socialPostTitle(post)}).`,
    });
  }

  function dropHandlers(targetId: string) {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDropOver(targetId);
      },
      onDragLeave: () =>
        setDropOver((cur) => (cur === targetId ? null : cur)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setDropOver(null);
        const id = readDraggedSocialPostId(e);
        if (id) reschedule(id, targetId === UNSCHEDULED ? "" : targetId);
      },
    };
  }

  // ── render ─────────────────────────────────────────────────────────────

  const monthLabel = monthTitle(month);
  const libraryCount = all.filter((p) => p.evergreen).length;

  return (
    <section className="workspace-section soc">
      <div className="soc-toolbar">
        <div className="soc-monthnav">
          <button
            className="btn-mini"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            aria-label="Previous month"
            disabled={tab === "library"}
          >
            ‹
          </button>
          <h2 className="soc-month-title">
            {tab === "library" ? "Evergreen library" : monthLabel}
          </h2>
          <button
            className="btn-mini"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            aria-label="Next month"
            disabled={tab === "library"}
          >
            ›
          </button>
          {tab === "calendar" && month !== today.slice(0, 7) && (
            <button className="btn-mini" onClick={() => setMonth(today.slice(0, 7))}>
              Today
            </button>
          )}
        </div>

        <div className="filter-quick soc-channels">
          <button
            className={channelFilter === "" ? "active" : ""}
            onClick={() => setChannelFilter("")}
          >
            All channels
          </button>
          {channels.map((c) => (
            <button
              key={c}
              className={channelFilter === c ? "active" : ""}
              onClick={() => setChannelFilter(c)}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="soc-toolbar-right">
          <input
            className="search soc-search"
            placeholder="Search posts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="soc-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === "calendar"}
              className={tab === "calendar" ? "active" : ""}
              onClick={() => setTab("calendar")}
            >
              Calendar
            </button>
            <button
              role="tab"
              aria-selected={tab === "library"}
              className={tab === "library" ? "active" : ""}
              onClick={() => setTab("library")}
            >
              Evergreen{libraryCount > 0 ? ` (${libraryCount})` : ""}
            </button>
          </div>
          <button
            className="primary"
            onClick={() =>
              openCreate(
                tab === "library"
                  ? { evergreen: true, status: "backlog" }
                  : {},
              )
            }
          >
            + New post
          </button>
        </div>
      </div>

      {error && <div className="banner">{error}</div>}
      {importNote && <div className="banner soc-import-note">{importNote}</div>}

      {posts === null && !error ? (
        <p className="muted">Loading the calendar…</p>
      ) : all.length === 0 ? (
        <div className="soc-empty">
          <h3>No posts yet</h3>
          <p className="muted">
            The 2026 social media calendar spreadsheet is bundled with the app
            and loads itself the first time someone signs in. If that didn't
            happen — usually because Firestore refused the write — import it
            here, or start from scratch with + New post.
          </p>
          <div className="soc-empty-actions">
            <button
              className="primary"
              onClick={importSpreadsheet}
              disabled={importing}
            >
              {importing ? "Importing…" : "Import the 2026 spreadsheet"}
            </button>
            <button className="btn-mini" onClick={() => openCreate({})}>
              + New post
            </button>
          </div>
        </div>
      ) : tab === "library" ? (
        <>
          <p className="muted small soc-summary">
            Reusable posts with an enduring message and an asset ready to go.
            Open one to edit it, or use it to start a new post with the same copy.
          </p>
          {library.length === 0 ? (
            <p className="muted">
              {q || channelFilter
                ? "No evergreen posts match that filter."
                : "The library is empty. Tick “Keep in the evergreen library” on a post to file it here."}
            </p>
          ) : (
            <div className="soc-library">
              {library.map((p) => (
                <div key={p.id} className="soc-library-item">
                  <SocialPostCard
                    post={p}
                    detailed
                    onClick={() => setEditing({ mode: "edit", post: p })}
                  />
                  <div className="soc-library-actions">
                    <span className="muted small">
                      Written {monthTitle(p.month || month)}
                    </span>
                    <button className="btn-mini" onClick={() => reuse(p)}>
                      Use this post
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="soc-summary">
            <span className="muted small">
              {monthPosts.length} post{monthPosts.length === 1 ? "" : "s"} in{" "}
              {monthLabel}
              {channelFilter ? ` on ${channelFilter}` : ""}
              {q ? ` matching “${query.trim()}”` : ""}
              {" · drag a card to another day to reschedule it"}
            </span>
            <span className="soc-legend">
              {SOCIAL_POST_STATUSES.filter((s) => s.value !== "backlog").map(
                (s) => (
                  <span key={s.value} className="soc-legend-item">
                    <span
                      className="soc-status-dot"
                      style={{ background: s.color }}
                    />
                    {s.label}
                    {statusCounts.get(s.value) ? (
                      <span className="soc-legend-count">
                        {statusCounts.get(s.value)}
                      </span>
                    ) : null}
                  </span>
                ),
              )}
            </span>
          </div>

          <div className="soc-grid" role="grid" aria-label={monthLabel}>
            {WEEKDAYS.map((d) => (
              <div key={d} className="soc-weekday" role="columnheader">
                {d}
              </div>
            ))}
            {cells.map((iso, i) =>
              iso === null ? (
                <div key={`pad-${i}`} className="soc-cell pad" aria-hidden />
              ) : (
                <div
                  key={iso}
                  role="gridcell"
                  className={`soc-cell drop-target ${
                    iso === today ? "today" : ""
                  } ${isWeekend(iso) ? "weekend" : ""} ${
                    dropOver === iso ? "drop-over" : ""
                  }`}
                  {...dropHandlers(iso)}
                >
                  <div className="soc-cell-head">
                    <span className="soc-day">{Number(iso.slice(8))}</span>
                    <button
                      className="soc-cell-add"
                      onClick={() => openCreate({ date: iso })}
                      title={`New post on ${iso}`}
                      aria-label={`New post on ${iso}`}
                    >
                      +
                    </button>
                  </div>
                  <div className="soc-cell-posts">
                    {(byDate.get(iso) ?? []).map((p) => (
                      <SocialPostCard
                        key={p.id}
                        post={p}
                        onClick={() => setEditing({ mode: "edit", post: p })}
                      />
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>

          <div
            className={`soc-tray drop-target ${
              dropOver === UNSCHEDULED ? "drop-over" : ""
            }`}
            {...dropHandlers(UNSCHEDULED)}
          >
            <div className="section-head">
              <h2>Unscheduled</h2>
              <span className="muted small">
                Planned for {monthLabel} without a day yet · drop a card here to
                take it off the calendar
              </span>
            </div>
            {unscheduled.length === 0 ? (
              <p className="muted small">Everything this month has a date.</p>
            ) : (
              <div className="soc-tray-cards">
                {unscheduled.map((p) => (
                  <SocialPostCard
                    key={p.id}
                    post={p}
                    detailed
                    onClick={() => setEditing({ mode: "edit", post: p })}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {editing && editing.mode === "create" && (
        <SocialPostModal
          mode="create"
          initial={editing.initial}
          channels={channels}
          owners={owners}
          onCancel={() => setEditing(null)}
          onSave={savePost}
        />
      )}
      {editing && editing.mode === "edit" && (
        <SocialPostModal
          key={editing.post.id}
          mode="edit"
          initial={editing.post}
          channels={channels}
          owners={owners}
          onCancel={() => setEditing(null)}
          onSave={savePost}
          onDelete={() => removePost(editing.post.id)}
        />
      )}
    </section>
  );
}
