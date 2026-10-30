import { useActivityPortal, type ActivityKind } from "../activityPortal";
import { Icon } from "./Icon";

// "Open in activity portal" for a campaign, webinar or event: a link to its
// page inside the marketing activity portal on SharePoint. Until the portal
// has been put on SharePoint, it offers to set that up instead. Renders
// nothing for an item that hasn't been saved yet.
type Props = {
  kind: ActivityKind;
  id?: string;
  className?: string;
  // Shorter labels for tight spots such as cards.
  short?: boolean;
  // Cards show nothing until the portal exists rather than a set-up button
  // on every one of them.
  offerSetup?: boolean;
};

export function ActivityPortalLink({ kind, id, className = "btn btn-ghost btn-sm", short = false, offerSetup = true }: Props) {
  const portal = useActivityPortal();
  if (!id) return null;
  const url = portal.itemUrl(kind, id);
  if (url) {
    return (
      <a className={className} href={url} target="_blank" rel="noopener noreferrer" title="Open this in the marketing activity portal on SharePoint">
        <Icon name="external-link" size={14} /> {short ? "Activity portal" : "Open in activity portal"}
      </a>
    );
  }
  if (!offerSetup) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={portal.openSetup}
      title="The marketing activity portal is one SharePoint page for every campaign, webinar and event. Set it up once and every item links to its page there."
    >
      <Icon name="browser" size={14} /> {short ? "Set up portal" : "Set up activity portal"}
    </button>
  );
}

// The same link as a row in an item page's Links list; nothing until the
// portal exists.
export function ActivityPortalListItem({ kind, id, label }: { kind: ActivityKind; id: string; label: string }) {
  const url = useActivityPortal().itemUrl(kind, id);
  if (!url) return null;
  return (
    <li>
      <Icon name="browser" size={16} />
      <a href={url} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    </li>
  );
}
