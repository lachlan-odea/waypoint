import type { Designer } from "../types";

type Props = {
  designer: Designer;
  className?: string;
  title?: string;
};

export function Avatar({ designer, className = "dot-avatar", title }: Props) {
  if (designer.avatar) {
    return (
      <span className={`${className} has-image`} title={title ?? designer.name}>
        <img src={designer.avatar} alt={designer.name} />
      </span>
    );
  }
  return (
    <span
      className={className}
      style={{ background: designer.color }}
      title={title ?? designer.name}
    >
      {designer.initials}
    </span>
  );
}
