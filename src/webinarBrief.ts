import type { Campaign, Designer, KitValue, WebinarKit } from "./types";
import {
  DELIVERY,
  FORMATS,
  KINDS,
  PHASES,
  ROLES,
  SEC_BY_KEY,
  STAGE_LABEL,
  STATUS,
  TYPES,
  ctxFor,
  fieldValue,
  kitName,
  kitState,
  lines,
  schedule,
  type Ctx,
  type FieldSpec,
  type SectionSpec,
} from "./webinarKit";
import { formatShort, todayIso } from "./dates";

// The briefing document for a webinar: a Word file of kit sections 01
// Webinar brief, 02 Core message & value, 04 Speakers, run of show & assets
// and 05 Runsheet & storyboard, for the people who present and produce it.
// Built in the browser with the docx library, loaded only when asked for.

export const BRIEF_SECTIONS = ["brief", "core", "confirm", "runsheet"] as const;

const BLUE = "1D1765";
const COBALT = "371EE1";
const INK = "141E30";
const MUTED = "5D6B82";
const LINE = "DDE1E8";
const FONT = "DM Sans";
const MONO = "DM Mono";

type Docx = typeof import("docx");

const str = (v: KitValue | undefined): string =>
  typeof v === "string" ? v : v == null || typeof v === "boolean" ? "" : Array.isArray(v) ? v.join(", ") : String(v);

function optLabel(f: FieldSpec, value: string): string {
  if (!f.opts) return value;
  for (const o of f.opts) {
    if (Array.isArray(o)) {
      if (o[0] === value) return o[1];
    } else if (o === value) return o;
  }
  return value;
}

export function briefFileName(campaign: Campaign): string {
  const safe = kitName(campaign).replace(/[\\/:*?"<>|]+/g, "").trim() || "Webinar";
  return `${safe} – Webinar brief.docx`;
}

export async function downloadWebinarBrief(
  campaign: Campaign,
  kit: WebinarKit,
  designers: Designer[],
): Promise<void> {
  const docx = await import("docx");
  const doc = buildBrief(docx, campaign, kit, designers);
  const blob = await docx.Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = briefFileName(campaign);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Exported for tests; the app goes through downloadWebinarBrief.
export function buildBrief(d: Docx, campaign: Campaign, kit: WebinarKit, designers: Designer[]) {
  const { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, LevelFormat } = d;
  const ctx = ctxFor(campaign, kit);
  const st = kitState(kit, todayIso());
  const sch = schedule(kit);
  const name = (id?: string) => (id ? (designers.find((x) => x.id === id)?.name ?? "") : "");

  const text = (t: string, o: { bold?: boolean; color?: string; size?: number; font?: string; italics?: boolean } = {}) =>
    new TextRun({ text: t, bold: o.bold, color: o.color, size: o.size, font: o.font ?? FONT, italics: o.italics });
  const para = (t: string, o: { bold?: boolean; color?: string; size?: number; after?: number; font?: string; italics?: boolean } = {}) =>
    new Paragraph({ children: [text(t, o)], spacing: { after: o.after ?? 120 } });
  const eyebrow = (t: string) =>
    new Paragraph({
      children: [new TextRun({ text: t.toUpperCase(), font: MONO, size: 16, color: COBALT, characterSpacing: 60 })],
      spacing: { before: 240, after: 60 },
    });
  const h1 = (t: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [text(t, { bold: true, color: BLUE, size: 40 })], spacing: { after: 120 } });
  const h2 = (t: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [text(t, { bold: true, color: BLUE, size: 28 })], spacing: { before: 120, after: 80 } });
  const h3 = (t: string) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [text(t, { bold: true, color: INK, size: 22 })], spacing: { before: 200, after: 60 } });
  const label = (t: string) => new Paragraph({ children: [text(t, { bold: true, color: INK, size: 20 })], spacing: { before: 160, after: 40 } });
  const body = (t: string) =>
    t
      .split(/\r?\n/)
      .map((line) => new Paragraph({ children: [text(line || " ", { color: INK, size: 21 })], spacing: { after: 60 } }));
  const bullets = (items: string[]) =>
    items.map((it) => new Paragraph({ children: [text(it, { color: INK, size: 21 })], numbering: { reference: "bullets", level: 0 }, spacing: { after: 40 } }));
  const muted = (t: string) => para(t, { color: MUTED, size: 19, after: 80 });
  const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
  const cell = (t: string, o: { head?: boolean; width?: number } = {}) =>
    new TableCell({
      children: t.split(/\r?\n/).map((line) => new Paragraph({ children: [text(line || " ", { bold: o.head, color: o.head ? MUTED : INK, size: o.head ? 17 : 20, font: o.head ? MONO : FONT })] })),
      width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
      shading: o.head ? { fill: "F7F8FB", color: "auto" } : undefined,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
    });
  const table = (head: string[], rows: string[][], widths?: number[]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders,
      rows: [
        new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h.toUpperCase(), { head: true, width: widths?.[i] })) }),
        ...rows.map((r) => new TableRow({ children: r.map((v, i) => cell(v, { width: widths?.[i] })) })),
      ],
    });
  const kv = (rows: [string, string][]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: border, bottom: border, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideHorizontal: border, insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
      rows: rows.map(
        ([k, v]) =>
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ children: [text(k, { color: MUTED, size: 19 })] })], width: { size: 28, type: WidthType.PERCENTAGE }, margins: { top: 70, bottom: 70, left: 0, right: 120 } }),
              new TableCell({ children: [new Paragraph({ children: [text(v || "—", { color: INK, size: 20 })] })], width: { size: 72, type: WidthType.PERCENTAGE }, margins: { top: 70, bottom: 70, left: 0, right: 0 } }),
            ],
          }),
      ),
    });

  // ── Cover ──────────────────────────────────────────────────────────────
  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
  children.push(eyebrow(`Webinar brief · ${TYPES[kit.type]?.tag ?? "Webinar"} · ${DELIVERY[kit.delivery] ?? ""}`));
  children.push(h1(kitName(campaign)));
  const sub = kit.ft || kit.wt;
  if (sub && sub !== kitName(campaign)) children.push(para(sub, { color: MUTED, size: 24, after: 160 }));
  const lead = name(kit.lead);
  children.push(
    kv([
      ["Go-live", kit.goLive ? formatShort(kit.goLive) : "Not set"],
      ...(kit.delivery === "prerecorded" ? [["Recording", kit.recordDate ? formatShort(kit.recordDate) : "Not set"] as [string, string]] : []),
      ["Sessions", kit.sessions],
      ["Duration", kit.duration],
      ["Format", kit.format ? FORMATS[kit.format]?.label ?? kit.format : ""],
      ["Stage", STAGE_LABEL[kit.stage] ?? kit.stage],
      ...(kit.phase ? [["Strategy phase", PHASES[kit.phase] ?? kit.phase] as [string, string]] : []),
      ...(kit.series ? [["Series", kit.series + (kit.ep ? ` · Episode ${kit.ep}` : "")] as [string, string]] : []),
      ["Project lead", lead],
      ["Brand", campaign.brand || ""],
      ...(kit.folder ? [["Project folder", kit.folder] as [string, string]] : []),
    ]),
  );
  children.push(muted(`Sections ${BRIEF_SECTIONS.map((k) => String(SEC_BY_KEY[k].n).padStart(2, "0")).join(", ")} of the 2026 webinar kit, exported from Waypoint on ${formatShort(todayIso())}.`));

  // ── Sections ───────────────────────────────────────────────────────────
  for (const key of BRIEF_SECTIONS) {
    const s = SEC_BY_KEY[key];
    const info = st.infos.find((i) => i.s.k === key)!;
    children.push(new Paragraph({ children: [], pageBreakBefore: true }));
    children.push(eyebrow(`Section ${String(s.n).padStart(2, "0")} · ${STATUS[info.st]}${sch[key].due ? ` · due ${formatShort(sch[key].due)}` : ""}`));
    children.push(h2(s.title));
    children.push(muted(whoLine(s)));
    if (s.intro) children.push(para(s.intro, { color: INK, size: 21, after: 160, italics: true }));
    for (const f of s.fields) {
      if (f.show && !f.show(kit)) continue;
      children.push(...renderField(f, s.k, ctx, { h3, label, body, bullets, muted, table, para, name }));
    }
  }

  return new Document({
    creator: "Waypoint",
    title: `${kitName(campaign)} – Webinar brief`,
    description: "Webinar brief exported from Waypoint",
    styles: {
      default: { document: { run: { font: FONT, size: 21, color: INK } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, bold: true, color: BLUE, size: 40 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, bold: true, color: BLUE, size: 28 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, bold: true, color: INK, size: 22 } },
      ],
    },
    numbering: {
      config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 480, hanging: 240 } } } }] }],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
        headers: {
          default: new d.Header({
            children: [new Paragraph({ children: [new TextRun({ text: `WAYPOINT · WEBINAR BRIEF · ${kitName(campaign).toUpperCase()}`, font: MONO, size: 14, color: MUTED, characterSpacing: 60 })] })],
          }),
        },
        footers: {
          default: new d.Footer({
            children: [new Paragraph({ children: [new TextRun({ text: `© ${new Date().getFullYear()} WiseTech Global · Confidential`, font: MONO, size: 14, color: MUTED })] })],
          }),
        },
        children,
      },
    ],
  });
}

function whoLine(s: SectionSpec): string {
  const withs = s.with.map((r) => ROLES[r].label);
  const joined = withs.length ? ` with ${withs.join(", ").replace(/, ([^,]*)$/, " and $1")}` : "";
  return `Completed by ${ROLES[s.owner].label}${joined} · ${s.timing}`;
}

type Render = {
  h3: (t: string) => unknown;
  label: (t: string) => unknown;
  body: (t: string) => unknown[];
  bullets: (items: string[]) => unknown[];
  muted: (t: string) => unknown;
  table: (head: string[], rows: string[][], widths?: number[]) => unknown;
  para: (t: string, o?: { color?: string; size?: number; after?: number; italics?: boolean; bold?: boolean }) => unknown;
  name: (id?: string) => string;
};

// One field as document blocks. Empty fields are left out, except the
// ones that frame the brief (go-live, titles), which show "Not set".
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderField(f: FieldSpec, sec: string, c: Ctx, r: Render): any[] {
  const key = f.k ?? "";
  const part = (suffix: string) => c.V(sec)[`${key}|${suffix}`];
  switch (f.t) {
    case "heading":
      return [r.h3(f.label ?? "")];
    case "metrics":
    case "emailmetrics":
      return [];
    case "group": {
      const K = KINDS[f.kind ?? ""];
      if (!K) return [];
      const items = c.items(f.kind!, f.list);
      const cols = (f.cols ?? Object.keys(K.fields)).filter((col) => !["headshot", "packAsset", "asset"].includes(col) || items.some((i) => str(i.d[col])));
      const out: unknown[] = [r.label(f.label ?? "")];
      if (!items.length) {
        out.push(r.muted(K.empty || "None yet."));
        return out;
      }
      out.push(r.table(cols.map((col) => K.fields[col]?.label ?? col), items.map((it) => cols.map((col) => str(it.d[col])))));
      if (f.kind === "ros") {
        const mins = items.reduce((s, it) => s + (Number(it.d.mins) || 0), 0);
        out.push(r.muted(`Total ${mins} min`));
      }
      return out;
    }
    case "approval": {
      const ok = !!part("ok");
      const by = r.name(str(part("by")));
      const date = str(part("date"));
      return [r.label(f.label ?? "Approval"), r.para(ok ? `Approved${by ? ` by ${by}` : ""}${date ? ` on ${formatShort(date)}` : ""}` : "Not yet approved", { color: ok ? INK : MUTED, size: 20 })];
    }
    case "checklist": {
      const rows = (f.items ?? []).map((lbl, i) => `${part(`c${i}|done`) ? "☑" : "☐"} ${lbl}${str(part(`c${i}|url`)) ? ` — ${str(part(`c${i}|url`))}` : ""}`);
      const extra = c.items("xitem", key).map((it) => `${it.d.done ? "☑" : "☐"} ${str(it.d.label)}${str(it.d.url) ? ` — ${str(it.d.url)}` : ""}`);
      return [r.label(f.label ?? ""), ...r.body([...rows, ...extra].join("\n"))];
    }
    case "copyasset": {
      const copy = str(part("copy")), asset = str(part("asset"));
      if (!copy && !asset) return [];
      return [r.label(f.label ?? ""), ...r.body(copy), ...(asset ? [r.muted(`Image: ${asset}`)] : [])];
    }
    case "emailseq":
      return [];
    default: {
      const raw = fieldValue(c, f, sec);
      const required = f.p && ["goLive", "wt", "ft"].includes(key);
      if (!str(raw) && !(Array.isArray(raw) && raw.length) && raw !== true) {
        return required ? [r.label(f.label ?? key), r.muted("Not set")] : [];
      }
      if (f.t === "check") return [r.para(`${raw ? "☑" : "☐"} ${f.label ?? key}`, { size: 20 })];
      if (f.t === "multi") return [r.label(f.label ?? key), ...r.bullets(Array.isArray(raw) ? raw : [str(raw)])];
      if (f.t === "list") return [r.label(f.label ?? key), ...r.bullets(lines(str(raw)))];
      if (f.t === "select") return [r.label(f.label ?? key), r.para(optLabel(f, str(raw)), { size: 20 })];
      if (f.t === "date") return [r.label(f.label ?? key), r.para(formatShort(str(raw)), { size: 20 })];
      if (f.t === "area") return [r.label(f.label ?? key), ...r.body(str(raw))];
      return [r.label(f.label ?? key), r.para(str(raw), { size: 20 })];
    }
  }
}
