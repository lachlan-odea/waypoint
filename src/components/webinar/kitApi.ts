import { useMemo } from "react";
import type { Campaign, Designer, KitCore, KitItem, KitSectionState, KitValue, Speaker, WebinarKit } from "../../types";
import {
  STATUS,
  WEBINAR_DEF,
  addActivity,
  ctxFor,
  newKitId,
  setKitRoot,
  setKitValue,
  withKit,
  type Ctx,
  type KitDef,
} from "../../webinarKit";

// Everything a kit component can do to a kit, as one object. Each call
// builds the next kit from the current one and hands it to the host (the
// campaign a webinar kit sits on, the event a major event kit sits on),
// which saves its whole document so the live subscription brings it back.
// Activity is logged on the kit at the same time.
export type KitApi = {
  // Which workflow this kit follows: its sections, roles and rows.
  def: KitDef;
  // The id of the campaign or event the kit sits on.
  hostId: string;
  kit: KitCore;
  ctx: Ctx;
  designers: Designer[];
  me: string;
  readOnly: boolean;
  update: (fn: (kit: KitCore) => KitCore, what?: string, detail?: string, section?: string) => void;
  setValue: (sec: string, key: string, value: KitValue | undefined, label?: string) => void;
  setRoot: (key: string, value: KitValue | undefined, label?: string) => void;
  setName: (name: string) => void;
  setSection: (sec: string, patch: KitSectionState, what?: string, detail?: string) => void;
  addItem: (kind: string, list?: string, extra?: Record<string, KitValue>, section?: string) => void;
  addMany: (kind: string, rows: Record<string, KitValue>[], section?: string) => void;
  moveItem: (id: string, dir: -1 | 1) => void;
  removeItem: (id: string, section?: string) => void;
  setItem: (id: string, col: string, value: KitValue | undefined) => void;
  addFile: (section: string, name: string, url: string) => void;
  removeFile: (id: string) => void;
  addNote: (section: string, text: string) => void;
  removeNote: (id: string) => void;
  setLead: (id: string | undefined) => void;
  setTeam: (role: string, ids: string[]) => void;
  // The speaker directory, and saving a webinar's speaker row into it.
  speakers: Speaker[];
  saveSpeakerFromItem: (item: KitItem) => void;
};

// A webinar's API: the kit's own fields are known, and the campaign is at
// hand for the parts only a webinar has (TwentyThree, the briefing doc).
export type WebinarKitApi = KitApi & { campaign: Campaign; kit: WebinarKit };

export type KitExtras = {
  speakers: Speaker[];
  saveSpeaker: (speaker: Speaker) => void;
};

const NO_EXTRAS: KitExtras = { speakers: [], saveSpeaker: () => {} };

// What the kit sits on, as far as the API needs to know.
export type KitHost = {
  id: string;
  // Save this kit on the host's document.
  commit: (kit: KitCore) => void;
  // A project-level field: its value, and saving a new one. Some live on
  // the kit, some on the host (its name, an event's dates and venue).
  root: (key: string) => KitValue | undefined;
  setRoot: (kit: KitCore, key: string, value: KitValue | undefined) => void;
  rename: (kit: KitCore, name: string) => void;
};

export function useKitCore(
  def: KitDef,
  kit: KitCore,
  host: KitHost,
  designers: Designer[],
  me: string,
  readOnly = false,
  extras: KitExtras = NO_EXTRAS,
): KitApi {
  const { speakers, saveSpeaker } = extras;
  return useMemo(() => {
    const update: KitApi["update"] = (fn, what, detail, section = "") => {
      let next = fn(kit);
      if (what) next = addActivity(next, section, what, detail, me);
      host.commit(next);
    };
    const label = (sec: string, key: string, fallback?: string) =>
      fallback ?? def.secByKey[sec]?.fields.find((f) => f.k === key)?.label ?? key;
    const siblingsOf = (k: KitCore, kind: string, list?: string) =>
      k.items.filter((i) => i.kind === kind && (list ? i.list === list : !i.list));
    const api: KitApi = {
      def,
      hostId: host.id,
      kit,
      ctx: {
        kit,
        root: host.root,
        V: (sec) => kit.values[sec] ?? {},
        items: (kind, list) => siblingsOf(kit, kind, list).sort((a, b) => a.order - b.order || a.at.localeCompare(b.at)),
      },
      designers,
      me,
      readOnly,
      update,
      setValue: (sec, key, value, lbl) =>
        update((k) => setKitValue(k, sec, key, value), "updated", label(sec, key, lbl), sec),
      setRoot: (key, value, lbl) => host.setRoot(addActivity(kit, "", "updated", lbl ?? key, me), key, value),
      setName: (name) => host.rename(addActivity(kit, "", `renamed the ${def.noun}`, name, me), name),
      setSection: (sec, patch, what, detail) =>
        update(
          (k) => ({ ...k, sec: { ...k.sec, [sec]: { ...(k.sec[sec] ?? {}), ...patch, by: me, at: new Date().toISOString() } } }),
          what,
          detail,
          sec,
        ),
      addItem: (kind, list, extra, section = "") =>
        update(
          (k) => {
            const siblings = siblingsOf(k, kind, list);
            const item: KitItem = {
              id: newKitId("i"),
              kind,
              list,
              order: siblings.length ? Math.max(...siblings.map((i) => i.order)) + 1 : 1,
              d: { ...(def.kinds[kind]?.defaults ?? {}), ...(extra ?? {}) },
              by: me,
              at: new Date().toISOString(),
            };
            return { ...k, items: [...k.items, item] };
          },
          "added",
          def.kinds[kind]?.noun ?? kind,
          section,
        ),
      addMany: (kind, rows, section = "") =>
        update(
          (k) => {
            const siblings = siblingsOf(k, kind);
            let order = siblings.length ? Math.max(...siblings.map((i) => i.order)) : 0;
            const at = new Date().toISOString();
            const items = rows.map((d) => ({
              id: newKitId("i"),
              kind,
              order: ++order,
              d: { ...(def.kinds[kind]?.defaults ?? {}), ...d },
              by: me,
              at,
            }));
            return { ...k, items: [...k.items, ...items] };
          },
          "added",
          `${rows.length} rows`,
          section,
        ),
      moveItem: (id, dir) =>
        update((k) => {
          const it = k.items.find((i) => i.id === id);
          if (!it) return k;
          const list = siblingsOf(k, it.kind, it.list).sort((a, b) => a.order - b.order || a.at.localeCompare(b.at));
          const idx = list.findIndex((i) => i.id === id);
          const j = idx + dir;
          if (j < 0 || j >= list.length) return k;
          const reordered = list.slice();
          [reordered[idx], reordered[j]] = [reordered[j], reordered[idx]];
          const orderOf = new Map(reordered.map((i, n) => [i.id, n + 1]));
          return { ...k, items: k.items.map((i) => (orderOf.has(i.id) ? { ...i, order: orderOf.get(i.id)! } : i)) };
        }),
      removeItem: (id, section = "") =>
        update(
          (k) => ({ ...k, items: k.items.filter((i) => i.id !== id) }),
          "removed",
          def.kinds[kit.items.find((i) => i.id === id)?.kind ?? ""]?.noun ?? "an item",
          section,
        ),
      setItem: (id, col, value) =>
        update((k) => ({
          ...k,
          items: k.items.map((i) => {
            if (i.id !== id) return i;
            const d = { ...i.d };
            if (value === undefined || value === "") delete d[col];
            else d[col] = value;
            return { ...i, d };
          }),
        })),
      addFile: (section, name, url) =>
        update(
          (k) => ({ ...k, files: [{ id: newKitId("f"), section, name, url, by: me, at: new Date().toISOString() }, ...k.files] }),
          "added a link",
          name,
          section,
        ),
      removeFile: (id) =>
        update(
          (k) => ({ ...k, files: k.files.filter((f) => f.id !== id) }),
          "removed",
          kit.files.find((f) => f.id === id)?.name ?? "a link",
          kit.files.find((f) => f.id === id)?.section ?? "",
        ),
      addNote: (section, text) =>
        update(
          (k) => ({ ...k, notes: [...k.notes, { id: newKitId("n"), section, text: text.slice(0, 4000), by: me, at: new Date().toISOString() }] }),
          "added a note",
          "",
          section,
        ),
      removeNote: (id) => update((k) => ({ ...k, notes: k.notes.filter((n) => n.id !== id) })),
      setLead: (id) => update((k) => ({ ...k, lead: id }), id ? "set the project lead" : "cleared the project lead"),
      setTeam: (role, ids) => update((k) => ({ ...k, team: { ...k.team, [role]: ids } }), "updated the team", def.roles[role]?.label ?? role),
      speakers,
      saveSpeakerFromItem: (item) => {
        const str = (v: KitValue | undefined) => (typeof v === "string" ? v : "");
        const existingId = str(item.d.speakerId);
        const existing = speakers.find((s) => s.id === existingId);
        const now = new Date().toISOString();
        const speaker: Speaker = {
          id: existing?.id ?? `spk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          name: str(item.d.name).trim(),
          title: str(item.d.title).trim(),
          bio: str(item.d.bio),
          headshot: str(item.d.headshot).trim(),
          linkedin: existing?.linkedin,
          email: str(item.d.email).trim() || existing?.email,
          notes: existing?.notes,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        if (!speaker.name) return;
        saveSpeaker(speaker);
        if (existingId !== speaker.id) {
          update(
            (k) => ({ ...k, items: k.items.map((i) => (i.id === item.id ? { ...i, d: { ...i.d, speakerId: speaker.id } } : i)) }),
            existing ? "updated the directory entry for" : "saved to the speaker directory",
            speaker.name,
          );
        }
      },
    };
    return api;
  }, [def, kit, host, designers, me, readOnly, speakers, saveSpeaker]);
}

// The API for a webinar: the webinar kit on its campaign.
export function useKitApi(
  campaign: Campaign,
  kit: WebinarKit,
  designers: Designer[],
  me: string,
  onSave: (campaign: Campaign) => void,
  readOnly = false,
  extras: KitExtras = NO_EXTRAS,
): WebinarKitApi {
  const host = useMemo<KitHost>(
    () => ({
      id: campaign.id,
      commit: (k) => onSave(withKit(campaign, k as WebinarKit)),
      root: ctxFor(campaign, kit).root,
      setRoot: (k, key, value) => onSave(withKit(campaign, setKitRoot(k as WebinarKit, key, value))),
      rename: (k, name) => onSave(withKit({ ...campaign, name }, k as WebinarKit)),
    }),
    [campaign, kit, onSave],
  );
  const core = useKitCore(WEBINAR_DEF, kit, host, designers, me, readOnly, extras);
  return useMemo(() => ({ ...core, campaign, kit }), [core, campaign, kit]);
}

export const statusLabel = (st: keyof typeof STATUS) => STATUS[st];
