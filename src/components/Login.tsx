import { useCallback, useEffect, useRef, useState } from "react";
import type { Designer } from "../types";
import {
  claimDesignerProfile,
  createDesignerProfile,
  loadDesigner,
  loadDesignerProfiles,
} from "../firestore";
import { resetPassword, signIn, signUp } from "../firebase";
import { HORIZONTAL_VIEWBOX, WaypointLogo } from "./brand/WaypointLogo";
import { MARK_BARS, WORDMARK } from "./brand/wordmark";
import { WiseTechLogo } from "./brand/WiseTechLogo";
import "../login.css";

// The sign-in page, from the "Waypoint Login" design: a WiseTech Blue field
// with a faint grid, the proposition on the left, the card on the right, and
// an intro where the mark draws itself, the wordmark reveals, and the logo
// flies into its place on the card. Sign-up and password reset keep their
// existing Firebase flows.

// Restrict signups to the team's email domain. Loosen / remove if you want
// outside collaborators to be able to register themselves.
const ALLOWED_EMAIL_DOMAIN = "wisetechglobal.com";

// Clicks on the card's logo needed to reveal the trophy, and the longest gap
// allowed between them for the clicks to count as "in a row".
const EGG_CLICKS = 5;
const EGG_WINDOW_MS = 1500;

// The intro's length in seconds.
const INTRO_END = 4.3;

type Mode = "signin" | "signup";

type Props = {
  onSignedIn: (designerId: string) => void;
  // Shown above the form, e.g. why the person was signed out.
  notice?: string;
};

function friendlyError(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: string }).code;
    switch (code) {
      case "auth/invalid-email":
        return "That doesn't look like a valid email.";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Email or password is incorrect.";
      case "auth/email-already-in-use":
        return "An account with that email already exists. Try Sign in.";
      case "auth/weak-password":
        return "Password needs to be at least 6 characters.";
      case "auth/too-many-requests":
        return "Too many attempts. Try again in a minute.";
      case "auth/network-request-failed":
        return "Network error. Check your connection and try again.";
    }
  }
  return err instanceof Error ? err.message : String(err);
}

function TrophyIcon() {
  return (
    <svg className="lg-egg-trophy" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V17h3v2H8v-2h3v-2.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3V3Zm0 4H6v1a2 2 0 0 0 1 1.7V7Zm10 0v2.7A2 2 0 0 0 18 8V7h-1Z"
        fill="#f5c542"
        stroke="#b8860b"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <rect x="7" y="19" width="10" height="2" rx="0.5" fill="#b8860b" />
    </svg>
  );
}

// ── Intro timing ────────────────────────────────────────────────────────

const c01 = (v: number) => Math.max(0, Math.min(1, v));
const easeInOut = (v: number) => {
  v = c01(v);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};
const easeOut = (v: number) => 1 - Math.pow(1 - c01(v), 3);
const easeOutQuart = (v: number) => 1 - Math.pow(1 - c01(v), 4);
const lerp = (a: number, z: number, p: number) => a + (z - a) * p;
function mix(a: string, z: string, p: number): string {
  const h = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const A = h(a), Z = h(z);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, Z[i], p))).join(",")})`;
}

// Drives `t` from 0 to INTRO_END seconds. Starts at the end when the person
// prefers reduced motion. `replay` runs it again.
function useIntro(): { t: number; replay: () => void } {
  const reduce =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [t, setT] = useState(reduce ? INTRO_END : 0);
  const raf = useRef(0);
  const timer = useRef(0);
  const start = useCallback(() => {
    cancelAnimationFrame(raf.current);
    window.clearTimeout(timer.current);
    const t0 = performance.now();
    const tick = () => {
      const now = Math.min(INTRO_END, (performance.now() - t0) / 1000);
      setT(now);
      if (now < INTRO_END) {
        raf.current = requestAnimationFrame(tick);
        // Fallback when requestAnimationFrame is throttled in a background tab.
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(tick, 40);
      }
    };
    tick();
  }, []);
  useEffect(() => {
    if (!reduce) start();
    return () => {
      cancelAnimationFrame(raf.current);
      window.clearTimeout(timer.current);
    };
  }, [reduce, start]);
  return { t, replay: start };
}

// The animated logo while the intro runs: the three bars draw in order, the
// destination bar fills, the mark slides left as the wordmark reveals, then
// the whole lockup flies to the card's logo slot and turns blue on the way.
function IntroOverlay({
  t,
  root,
  slot,
}: {
  t: number;
  root: HTMLDivElement | null;
  slot: HTMLDivElement | null;
}) {
  if (!root || !slot || t >= INTRO_END) return null;
  const rr = root.getBoundingClientRect();
  const sr = slot.getBoundingClientRect();
  const b = {
    x: sr.left - rr.left,
    y: sr.top - rr.top,
    h: sr.height,
    rw: root.clientWidth,
    rh: Math.min(root.clientHeight, window.innerHeight),
  };
  const pb = [easeInOut((t - 0.2) / 0.6), easeInOut((t - 0.45) / 0.6), easeInOut((t - 0.7) / 0.6)];
  const fill = easeInOut((t - 1.3) / 0.5);
  const move = easeInOut((t - 1.8) / 0.9);
  const reveal = easeOutQuart((t - 1.9) / 0.9);
  const fly = easeInOut((t - 2.9) / 0.85);
  const cp = easeInOut((t - 3.0) / 0.6);
  const bar = mix("#FFFFFF", "#1D1765", cp);
  const dest = mix("#B7B3FF", "#371EE1", cp);
  const W0 = Math.min(b.rw * 0.6, 760);
  const H0 = (W0 * 46) / 256;
  const w = lerp(W0, (b.h * 256) / 46, fly);
  const h = (w * 46) / 256;
  const x = lerp(b.rw / 2 - W0 / 2, b.x, fly);
  const y = lerp(b.rh / 2 - H0 / 2, b.y, fly);
  const dx = 108 * (1 - move);
  const ms = 1.5 - 0.5 * move;
  return (
    <svg
      aria-hidden="true"
      viewBox={HORIZONTAL_VIEWBOX}
      width={w}
      height={h}
      className="lg-intro"
      style={{ left: x, top: y }}
    >
      <g transform={`translate(${dx} 0) translate(24 24) scale(${ms}) translate(-24 -24)`}>
        {MARK_BARS.map(([bx, by, bw], i) => {
          const p = pb[i];
          if (p <= 0) return null;
          const isDest = i === 2;
          return (
            <rect
              key={i}
              x={bx}
              y={by}
              width={8 + (bw - 8) * p}
              height={8}
              rx={4}
              fill={isDest ? (fill > 0 ? dest : bar) : bar}
              opacity={isDest ? Math.min(1, p * 5) * (fill > 0 ? 1 : 0.35) : Math.min(1, p * 5)}
            />
          );
        })}
        {fill > 0 && fill < 1 && (
          <rect x={23 + 20 * fill} y={32} width={20 * (1 - fill)} height={8} rx={4} fill={bar} opacity={0.35} />
        )}
      </g>
      <g transform={`translate(${dx} 0)`}>
        <clipPath id="wp-login-clip">
          <rect x={52} y={0} width={reveal * 214} height={60} />
        </clipPath>
        <g clipPath="url(#wp-login-clip)">
          <path
            transform={`translate(${56 - WORDMARK.lsb - 14 * (1 - reveal)} 0)`}
            fill={bar}
            d={WORDMARK.d}
            opacity={Math.min(1, reveal * 2)}
          />
        </g>
      </g>
    </svg>
  );
}

// ── The page ────────────────────────────────────────────────────────────

export function Login({ onSignedIn, notice }: Props) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [claimId, setClaimId] = useState<string>("");
  const [legacyProfiles, setLegacyProfiles] = useState<Designer[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const [trophyShown, setTrophyShown] = useState(false);
  const eggRef = useRef({ count: 0, last: 0 });

  const { t, replay } = useIntro();
  const rootRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  // Re-measure the logo slot on resize while the intro is running.
  const [, bump] = useState(0);
  useEffect(() => {
    const onResize = () => bump((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const card = easeOut((t - 2.9) / 0.7);
  const left = easeOut((t - 3.3) / 0.8);
  const introDone = t >= INTRO_END;

  useEffect(() => {
    if (introDone) emailRef.current?.focus();
  }, [mode, introDone]);

  // Lazily load the existing designers for the claim picker the first time
  // the person opens Create account.
  useEffect(() => {
    if (mode !== "signup" || legacyProfiles.length > 0 || profilesLoading) return;
    setProfilesLoading(true);
    loadDesignerProfiles()
      .then((ps) => {
        // Only the legacy seed profiles (ids like d-something), not people
        // who've already signed up with a Firebase UID.
        setLegacyProfiles(ps.filter((p) => /^d-/.test(p.id)));
      })
      .catch((err) => console.warn("Couldn't load designer profiles", err))
      .finally(() => setProfilesLoading(false));
  }, [mode, legacyProfiles.length, profilesLoading]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setResetSent(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResetSent(false);
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError("Email and password are required.");
      return;
    }
    if (mode === "signup") {
      if (!name.trim()) {
        setError("Name is required.");
        return;
      }
      if (!trimmedEmail.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
        setError(`Use your @${ALLOWED_EMAIL_DOMAIN} email to create an account.`);
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === "signin") {
        const user = await signIn(trimmedEmail, password);
        const designer = await loadDesigner(user.uid);
        if (!designer) {
          throw new Error(
            "Your account exists but no Waypoint profile was found. Ask an admin to invite you again.",
          );
        }
        onSignedIn(designer.id);
      } else {
        const user = await signUp(trimmedEmail, password);
        if (claimId) {
          await claimDesignerProfile(claimId, user.uid, trimmedEmail);
        } else {
          await createDesignerProfile(user.uid, name.trim(), trimmedEmail);
        }
        onSignedIn(user.uid);
      }
    } catch (err) {
      console.error(err);
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email above first.");
      emailRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetPassword(trimmed);
      setResetSent(true);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  // Five quick clicks on the card's logo reveal a trophy. A pause longer than
  // EGG_WINDOW_MS between clicks starts the count again.
  function onEggClick() {
    const now = Date.now();
    const egg = eggRef.current;
    egg.count = now - egg.last <= EGG_WINDOW_MS ? egg.count + 1 : 1;
    egg.last = now;
    if (egg.count >= EGG_CLICKS) {
      egg.count = 0;
      setTrophyShown(true);
    }
  }

  // Auto-fill the name when an existing profile is picked.
  function onClaimChange(id: string) {
    setClaimId(id);
    if (id) {
      const profile = legacyProfiles.find((p) => p.id === id);
      if (profile) setName(profile.name);
    }
  }

  const signin = mode === "signin";

  return (
    <div className="lg" ref={rootRef}>
      <div className="lg-grid" aria-hidden="true" />

      <div className="lg-main">
        <div className="lg-pitch" style={{ opacity: left, transform: `translateY(${(1 - left) * 12}px)` }}>
          <div className="lg-eyebrow">Marketing work management</div>
          <h1>Every campaign, from brief to launch</h1>
          <p>
            Plan campaigns, projects and events on one timeline. See every date, every owner and
            every launch — before it slips.
          </p>
          <div className="lg-motif" aria-hidden="true">
            <div>
              <span>PLAN</span>
              <i style={{ width: "58%" }} />
            </div>
            <div>
              <span>LAUNCH</span>
              <i style={{ width: "64%", marginLeft: "22%" }} />
            </div>
            <div>
              <span>TRACK</span>
              <i className="dest" style={{ width: "52%", marginLeft: "48%" }} />
            </div>
          </div>
        </div>

        <div className="lg-card" style={{ opacity: card, transform: `translateY(${(1 - card) * 16}px)` }}>
          <div className="lg-logo-slot" ref={slotRef} style={{ opacity: introDone ? 1 : 0 }}>
            <button
              type="button"
              className="lg-egg-hotspot"
              tabIndex={-1}
              aria-hidden="true"
              onClick={onEggClick}
            >
              <WaypointLogo variant="horizontal" color="blue" height={36} />
            </button>
            {trophyShown && (
              <span className="lg-egg">
                <TrophyIcon />
                <span className="lg-egg-bubble">Don't ask questions</span>
              </span>
            )}
          </div>

          <div className="lg-card-head">
            <h2>{signin ? "Sign in" : "Create your account"}</h2>
            <p>
              {signin
                ? "Welcome back. Pick up where your plan left off."
                : `Use your @${ALLOWED_EMAIL_DOMAIN} email. Pick an existing profile to keep its work.`}
            </p>
          </div>

          <form className="lg-form" onSubmit={handleSubmit} noValidate>
            {!signin && (
              <label className="lg-field">
                <span>{claimId ? "Display name (from existing profile)" : "Display name"}</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy || !!claimId}
                  placeholder="e.g. Jess Duguid"
                  autoComplete="name"
                />
              </label>
            )}
            <label className="lg-field">
              <span>Work email</span>
              <input
                ref={emailRef}
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="lg-field">
              <span>Password</span>
              <input
                type="password"
                autoComplete={signin ? "current-password" : "new-password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </label>
            {signin && (
              <div className="lg-forgot">
                <button type="button" className="lg-link" onClick={handleResetPassword} disabled={busy}>
                  Forgot password?
                </button>
              </div>
            )}
            {!signin && legacyProfiles.length > 0 && (
              <label className="lg-field">
                <span>Claim an existing profile (optional)</span>
                <select value={claimId} onChange={(e) => onClaimChange(e.target.value)} disabled={busy}>
                  <option value="">— New profile —</option>
                  {legacyProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <small>
                  Picking your existing profile keeps all of that designer's projects, comments and
                  notifications attached to you.
                </small>
              </label>
            )}

            {notice && !error && (
              <p className="lg-note" role="status">
                {notice}
              </p>
            )}
            {error && (
              <p className="lg-error" role="alert">
                {error}
              </p>
            )}
            {resetSent && <p className="lg-note">If that email exists, a reset link is on its way.</p>}

            <div className="lg-actions">
              <button className="lg-btn lg-btn-primary" type="submit" disabled={busy}>
                {busy ? (signin ? "Signing in…" : "Creating account…") : signin ? "Sign in" : "Create account"}
              </button>
              <div className="lg-or" aria-hidden="true">
                <span />
                OR
                <span />
              </div>
              <button
                type="button"
                className="lg-btn lg-btn-secondary"
                disabled={busy}
                onClick={() => switchMode(signin ? "signup" : "signin")}
              >
                {signin ? "Create an account" : "Back to sign in"}
              </button>
            </div>
          </form>

          <p className="lg-card-foot">
            {signin ? (
              <>
                New to Waypoint?{" "}
                <button type="button" className="lg-link" onClick={() => switchMode("signup")}>
                  Request access
                </button>
              </>
            ) : (
              <>
                Already have access?{" "}
                <button type="button" className="lg-link" onClick={() => switchMode("signin")}>
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>

      <footer className="lg-foot" style={{ opacity: left }}>
        <div className="lg-foot-left">
          <span className="lg-mono">A PRODUCT OF</span>
          <WiseTechLogo color="white" height={14} />
        </div>
        <div className="lg-foot-right">
          <span>© {new Date().getFullYear()} WiseTech Global</span>
          <button type="button" className="lg-replay" onClick={replay}>
            REPLAY INTRO
          </button>
        </div>
      </footer>

      <IntroOverlay t={t} root={rootRef.current} slot={slotRef.current} />
    </div>
  );
}
