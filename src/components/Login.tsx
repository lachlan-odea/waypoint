import { useEffect, useRef, useState } from "react";
import type { Designer } from "../types";
import { Avatar } from "./Avatar";

const heroImage = `${import.meta.env.BASE_URL}hero.png`;

type Props = {
  designers: Designer[];
  onLogin: (designerId: string) => void;
};

export function Login({ designers, onLogin }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedId) inputRef.current?.focus();
  }, [selectedId]);

  const selected = designers.find((d) => d.id === selectedId);

  function submit() {
    if (!selected) return;
    if (pin === selected.pin) {
      onLogin(selected.id);
    } else {
      setError("Incorrect PIN");
      setPin("");
      inputRef.current?.focus();
    }
  }

  function back() {
    setSelectedId(null);
    setPin("");
    setError(null);
  }

  return (
    <div className="login">
      <div className="login-card">
        <img src={heroImage} alt="Waypoint" className="login-hero" />
        <div className="login-brand">Waypoint</div>
        {!selected ? (
          <>
            <h1 className="login-title">Who are you?</h1>
            <p className="muted">Pick your tile to log in.</p>
            <div className="login-grid">
              {designers.map((d) => (
                <button
                  key={d.id}
                  className="login-tile"
                  onClick={() => {
                    setSelectedId(d.id);
                    setError(null);
                  }}
                >
                  <Avatar designer={d} className="dot-avatar login-avatar" />
                  <span className="login-name">{d.name}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button className="link-btn login-back" onClick={back}>
              ← back
            </button>
            <div className="login-selected">
              <Avatar designer={selected} className="dot-avatar login-avatar lg" />
              <h1 className="login-title">{selected.name}</h1>
              <p className="muted">Enter your 4-digit PIN.</p>
            </div>
            <input
              ref={inputRef}
              className="pin-input"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ""));
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            {error && <p className="login-error">{error}</p>}
            <button className="primary login-submit" onClick={submit} disabled={!pin}>
              Log in
            </button>
          </>
        )}
        <p className="muted small login-foot">
          Demo PINs are 1001–1009 in seed order. Change yours from the sidebar after logging in.
        </p>
      </div>
    </div>
  );
}
