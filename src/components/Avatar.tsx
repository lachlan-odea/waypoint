import { useState } from "react";
import type { Designer } from "../types";

type Props = {
  designer: Designer;
  className?: string;
  title?: string;
};

export function Avatar({ designer, className = "dot-avatar", title }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  if (designer.avatar && !imgFailed) {
    return (
      <span className={`${className} has-image`} title={title ?? designer.name}>
        <img
          src={designer.avatar}
          alt={designer.name}
          onError={() => setImgFailed(true)}
        />
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
