import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updatePassword as fbUpdatePassword,
  type User,
} from "firebase/auth";
import { initializeFirestore, persistentLocalCache } from "firebase/firestore";

// Firebase web `apiKey` is a public project identifier, not a secret. Access
// is gated by Firestore security rules + signed-in users only.
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
// Persist the signed-in user across reloads (default but explicit).
setPersistence(auth, browserLocalPersistence).catch((err) =>
  console.warn("Auth persistence setup failed", err),
);

// Subscribe to auth-state changes. The callback fires immediately with the
// cached user on load (or null), then again any time it changes.
export function observeAuth(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

export function signIn(email: string, password: string): Promise<User> {
  return signInWithEmailAndPassword(auth, email, password).then((c) => c.user);
}

export function signUp(email: string, password: string): Promise<User> {
  return createUserWithEmailAndPassword(auth, email, password).then(
    (c) => c.user,
  );
}

export function signOut(): Promise<void> {
  return fbSignOut(auth);
}

export function resetPassword(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email);
}

// Firebase requires recent authentication to change the password. We re-prompt
// for the current password and re-authenticate before issuing the update.
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error("Not signed in.");
  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);
  await fbUpdatePassword(user, newPassword);
}
