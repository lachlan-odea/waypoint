import type { ReactNode } from "react";
import type { Designer } from "../types";
import { resolveMention } from "../mentions";

// Known TLDs we'll treat a bare token like `cargowise.com` as a link for.
// Multi-segment forms (`co.uk`, `com.au`, …) are listed first so the regex
// engine prefers them over their shorter prefixes during alternation.
const TLDS = [
  "co.uk", "co.nz", "co.jp", "co.kr",
  "com.au", "com.br", "com.mx", "com.sg",
  "com", "org", "net", "io", "co", "ai", "app", "dev", "design",
  "gov", "edu", "info", "biz", "me", "tv", "xyz", "tech",
  "uk", "au", "us", "ca", "de", "fr", "jp", "in", "br",
  "mx", "eu", "nz", "ie", "nl", "se", "no", "fi", "dk",
  "es", "it", "ru", "cn", "kr", "sg", "hk", "za",
  "online", "store", "site", "shop", "news", "blog",
  "cloud", "global", "world", "agency", "studio",
];
const TLD = `(?:${TLDS.map((t) => t.replace(/\./g, "\\.")).join("|")})`;

// A domain is one-or-more "label." parts followed by a known TLD, optionally
// followed by a `/path…`. Used both inside markdown-style `[label](url)` and
// as a bare token. The leading lookbehind keeps us from matching after `@`
// (emails) or word/slash chars (file paths like `foo/bar.com`).
const DOMAIN_BODY = `(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+${TLD}\\b(?:/[^\\s<>"'\`]*)?`;
const HTTP_URL = `https?:\\/\\/[^\\s<>"'\`]+`;

const LINK_RE = new RegExp(
  `\\[([^\\]]+)\\]\\((${HTTP_URL}|${DOMAIN_BODY})\\)` + // [label](url)
    `|(${HTTP_URL})` + // bare http(s)://…
    `|(?<![\\w@/])(${DOMAIN_BODY})` + // bare cargowise.com
    `|(?<!\\w)@([A-Za-z]+)`, // @Jess mentions
  "g",
);

const TRAILING_PUNCT = /[.,;:!?)\]}'"]$/;

function normalizeHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

type Props = {
  text: string;
  designers?: Designer[];
};

export function LinkifiedText({ text, designers }: Props) {
  if (!text) return null;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  LINK_RE.lastIndex = 0;

  for (let m = LINK_RE.exec(text); m !== null; m = LINK_RE.exec(text)) {
    const [match, label, mdUrl, httpUrl, domain, mention] = m;
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));

    if (mdUrl) {
      parts.push(
        <a key={key++} href={normalizeHref(mdUrl)} target="_blank" rel="noreferrer">
          {label}
        </a>,
      );
    } else if (mention) {
      const resolved = designers ? resolveMention(mention, designers) : null;
      // Render as a styled mention chip; fall back to raw text if it doesn't
      // resolve to a known designer.
      if (resolved) {
        parts.push(
          <span
            key={key++}
            className="mention"
            title={resolved.name}
          >
            @{mention}
          </span>,
        );
      } else {
        parts.push(`@${mention}`);
      }
    } else {
      const raw = httpUrl || domain;
      let url = raw;
      let trailing = "";
      while (url.length > 0 && TRAILING_PUNCT.test(url)) {
        trailing = url.slice(-1) + trailing;
        url = url.slice(0, -1);
      }
      parts.push(
        <a key={key++} href={normalizeHref(url)} target="_blank" rel="noreferrer">
          {url}
        </a>,
      );
      if (trailing) parts.push(trailing);
    }

    lastIndex = m.index + match.length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}
