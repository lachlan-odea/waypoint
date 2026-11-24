import { useState } from "react";
import { copyText } from "../share";
import { Icon } from "./Icon";

// "Copy link" for an item page's header: copies the page's address and says
// so for a moment. The link is only an address, so whoever opens it still
// signs in.
type Props = {
  url: string;
  // What the link points at, for the tooltip: "campaign", "webinar"…
  noun: string;
};

export function CopyLinkButton({ url, noun }: Props) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    const ok = await copyText(url);
    setState(ok ? "copied" : "failed");
    window.setTimeout(() => setState("idle"), 2500);
  }
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={copy} title={`Copy a link to this ${noun}`}>
      <Icon name="link" size={14} />
      {state === "copied" ? "Link copied" : state === "failed" ? "Copy failed" : "Copy link"}
    </button>
  );
}
