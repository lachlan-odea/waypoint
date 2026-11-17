import { useState } from "react";
import type { Designer } from "../types";
import { readableTextOn } from "../contrast";

type Props = {
  designer: Designer;
  className?: string;
  title?: string;
  size?: number;
};

export function Avatar({ designer, className = "dot-avatar", title, size }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = designer.photoUrl;
  const style = size ? { width: size, height: size, fontSize: size / 2.5 } : undefined;
  if (src && !imgFailed) {
    return (
      <span className={`${className} has-image`} style={style} title={title ?? designer.name}>
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
      style={{ background: designer.color, color: readableTextOn(designer.color), ...style }}
      title={title ?? designer.name}
    >
      {designer.initials}
    </span>
  );
}
