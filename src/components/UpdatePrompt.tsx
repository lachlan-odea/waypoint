import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Icon } from "./Icon";

// How often an open tab asks the server whether a newer build exists. Without
// this the browser only checks on navigation, so a tab left open all day would
// never notice a deploy.
const UPDATE_CHECK_MS = 10 * 60 * 1000;

// If the new service worker hasn't taken over this long after Refresh, reload
// anyway rather than leave the person looking at a button that did nothing.
const RELOAD_FALLBACK_MS = 4000;

// Shows a toast when a new version of Waypoint has been deployed and is waiting
// to take over. Updating is the person's call, so nothing in progress is lost.
export default function UpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
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

  if (!needRefresh) return null;

  const refresh = () => {
    setRefreshing(true);
    // Reload as soon as the new worker controls the page, so what renders is
    // the new build. The plugin reloads too, but not on every update path.
    navigator.serviceWorker?.addEventListener(
      'controllerchange',
      () => window.location.reload(),
      { once: true },
    );
    window.setTimeout(() => window.location.reload(), RELOAD_FALLBACK_MS);
    void updateServiceWorker(true);
  };

  return (
    <div className="toast toast-update" role="status">
      <span>A new version of Waypoint is available.</span>
      <button className="toast-undo" onClick={refresh} disabled={refreshing}>
        {refreshing ? 'Refreshing…' : 'Click here to refresh'}
      </button>
      {!refreshing && (
        <button
          className="toast-close"
          onClick={() => setNeedRefresh(false)}
          aria-label="Dismiss"
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
