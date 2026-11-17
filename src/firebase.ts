import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updatePassword as fbUpdatePassword,
  updateProfile,
  type User,
} from "firebase/auth";
import { initializeFirestore, persistentLocalCache } from "firebase/firestore";

// Firebase web `apiKey` is a public project identifier, not a secret: anyone
// can use it to create an account. Access is gated by Firestore security
// rules, which only let in members (a signed-in user with a /designers
// profile at their UID, which only a super user can create).
export const firebaseConfig = {
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

// Creating an account doesn't let anyone in: it only gets them as far as
// the access request screen (src/components/AccessPending.tsx). The name
// they gave is kept on the account so the request can carry it, and the
// verification email goes out straight away, since Firestore rules only
// take a request from a verified address.
export async function signUp(email: string, password: string, name: string): Promise<User> {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(user, { displayName: name });
  await sendEmailVerification(user);
  return user;
}

export function resendVerificationEmail(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return Promise.reject(new Error("Not signed in."));
  return sendEmailVerification(user);
}

// Asks Firebase whether the address has been verified since the session
// started, and if it has, refreshes the ID token so Firestore rules see
// email_verified = true. Returns the current answer.
export async function refreshEmailVerified(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  await reload(user);
  if (user.emailVerified) await user.getIdToken(true);
  return user.emailVerified;
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
