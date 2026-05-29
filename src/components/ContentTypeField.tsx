import { useMemo, useState } from "react";
import { CONTENT_TYPES } from "../constants";

type Props = {
  value: string;
  onChange: (next: string) => void;
};

export function ContentTypeField({ value, onChange }: Props) {
  const isKnown = useMemo(
    () => !value || (CONTENT_TYPES as readonly string[]).includes(value),
    [value]
  );
  const [otherMode, setOtherMode] = useState(!isKnown);

  function handleSelect(next: string) {
    if (next === "__other__") {
      setOtherMode(true);
      onChange("");
      return;
    }
    setOtherMode(false);
    onChange(next);
  }

  const selectValue = otherMode ? "__other__" : value;

  return (
    <>
      <select value={selectValue} onChange={(e) => handleSelect(e.target.value)}>
        <option value="">— select —</option>
        {CONTENT_TYPES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        <option value="__other__">Other…</option>
      </select>
      {otherMode && (
        <input
          autoFocus
          placeholder="Type content type"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ marginTop: 6 }}
        />
      )}
    </>
  );
}
