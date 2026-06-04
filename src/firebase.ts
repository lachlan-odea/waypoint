import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  type User,
} from "firebase/auth";
import { initializeFirestore, persistentLocalCache } from "firebase/firestore";

// Firebase web `apiKey` is a public project identifier, not a secret. Access
// is gated by Firestore security rules + Anonymous Auth, so committing this
// is safe.
const firebaseConfig = {
  apiKey: "AIzaSyCCeatk1Bv-GwlZOnp_NQgRrMBTLgQNH1o",
  authDomain: "wtg-waypoint.firebaseapp.com",
  projectId: "wtg-waypoint",
  storageBucket: "wtg-waypoint.firebasestorage.app",
  messagingSenderId: "77272476016",
  appId: "1:77272476016:web:7ac5bda22782a636ba87b5",
};

export const firebaseApp = initializeApp(firebaseConfig);

// Enable IndexedDB persistence so edits made while offline queue up and the
// app can boot from cache before the first network round-trip.
export const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache(),
  ignoreUndefinedProperties: true,
});

export const auth = getAuth(firebaseApp);

// Resolves once we're signed in. Callers should await this before reading
// from Firestore — the security rules require an authenticated user.
export function ensureSignedIn(): Promise<User> {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          unsubscribe();
          resolve(user);
        }
      },
      (err) => {
        unsubscribe();
        reject(err);
      },
    );
    if (!auth.currentUser) {
      signInAnonymously(auth).catch((err) => {
        unsubscribe();
        reject(err);
      });
    }
  });
}
