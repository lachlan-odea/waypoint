import { useState } from "react";
import type { Designer } from "../types";

type Props = {
  designer: Designer;
  className?: string;
  title?: string;
};

export function Avatar({ designer, className = "dot-avatar", title }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = designer.photoUrl || designer.avatar;
  if (src && !imgFailed) {
    return (
      <span className={`${className} has-image`} title={title ?? designer.name}>
        <img
          src={src}
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
