import { useRegisterSW } from 'virtual:pwa-register/react';

// How often an open tab asks the server whether a newer build exists. Without
// this the browser only checks on navigation, so a tab left open all day would
// never notice a deploy.
const UPDATE_CHECK_MS = 10 * 60 * 1000;

// Shows a toast when a new version of Waypoint has been deployed and is waiting
// to take over. Updating is the person's call, so nothing in progress is lost.
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      window.setInterval(() => {
        if (registration.installing || !navigator.onLine) return;
        void registration.update();
      }, UPDATE_CHECK_MS);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="toast" role="status">
      <span>A new version of Waypoint is available.</span>
      <button
        className="toast-undo"
        onClick={() => void updateServiceWorker(true)}
      >
        Refresh
      </button>
      <button
        className="toast-close"
        onClick={() => setNeedRefresh(false)}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
