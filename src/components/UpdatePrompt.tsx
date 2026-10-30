import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// How often an open tab asks the server whether a newer build exists. Without
// this the browser only checks on navigation, so a tab left open all day would
// never notice a deploy.
const UPDATE_CHECK_MS = 10 * 60 * 1000;

// How long the toast counts down before the new build is applied on its own.
// Long enough to read the message and finish a sentence, short enough that
// nobody stays on an old build for the rest of the day.
const AUTO_RELOAD_S = 30;

// If the new service worker hasn't taken over this long after Refresh, reload
// anyway rather than leave the person looking at a button that did nothing.
const RELOAD_FALLBACK_MS = 4000;

// The reload is held while something would be lost by it: a modal is open or
// a field has focus. Checked every second once the countdown reaches zero.
function busyEditing(): boolean {
  if (document.querySelector('.modal-overlay')) return true;
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

// Shows a toast when a new version of Waypoint has been deployed and is
// waiting to take over, counts down, and applies it. Refresh now skips the
// wait; there is no dismiss, so every open tab moves to the new build.
export default function UpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const reloadStarted = useRef(false);
  const [manual, setManual] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_RELOAD_S);
  const [held, setHeld] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) registrationRef.current = registration;
    },
  });

  // Check for a new build on a timer, and whenever the person comes back to
  // the tab, so a deploy is noticed soon after they return to Waypoint.
  useEffect(() => {
    const check = () => {
      const registration = registrationRef.current;
      if (!registration || registration.installing || !navigator.onLine) return;
      registration.update().catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    const timer = window.setInterval(check, UPDATE_CHECK_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  function reload() {
    if (reloadStarted.current) return;
    reloadStarted.current = true;
    // Reload as soon as the new worker controls the page, so what renders is
    // the new build. The plugin reloads too, but not on every update path.
    navigator.serviceWorker?.addEventListener(
      'controllerchange',
      () => window.location.reload(),
      { once: true },
    );
    window.setTimeout(() => window.location.reload(), RELOAD_FALLBACK_MS);
    void updateServiceWorker(true);
  }

  // The countdown, once a new build is waiting.
  useEffect(() => {
    if (!needRefresh || manual) return;
    const id = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [needRefresh, manual]);

  // At zero, apply the update as soon as nothing is being edited.
  useEffect(() => {
    if (!needRefresh || manual || secondsLeft > 0) return;
    const id = window.setInterval(() => {
      if (busyEditing()) {
        setHeld(true);
        return;
      }
      setHeld(false);
      reload();
    }, 1000);
    return () => window.clearInterval(id);
    // reload only touches refs and the plugin's stable updater.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needRefresh, manual, secondsLeft]);

  if (!needRefresh) return null;

  const refreshing = manual || (secondsLeft === 0 && !held);
  const message = refreshing
    ? 'Updating Waypoint…'
    : held
      ? 'A new version of Waypoint is ready. It will apply once you finish editing.'
      : `A new version of Waypoint is ready. Updating in ${secondsLeft}s.`;

  return (
    <div className="toast toast-update" role="status">
      <span>{message}</span>
      <button
        className="toast-undo"
        onClick={() => {
          setManual(true);
          reload();
        }}
        disabled={refreshing}
      >
        {refreshing ? 'Refreshing…' : 'Refresh now'}
      </button>
    </div>
  );
}
