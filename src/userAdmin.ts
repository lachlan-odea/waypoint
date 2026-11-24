// The app's side of adding someone to Waypoint outright
// (functions/src/users.ts): one call a super user can make from Manage
// users, which creates the person's Firebase Auth account on the starting
// password the super user typed, their /designers profile — so they're a
// member the moment it exists — and the email that tells them. The
// password is passed straight through and kept nowhere in the app.
//
// It has to be a Cloud Function: the web SDK can only create an account
// by signing in as it, which would sign the super user out.

import { getFunctions, httpsCallable, type FunctionsError } from "firebase/functions";
import { firebaseApp } from "./firebase";

const REGION = "us-central1";
const functions = getFunctions(firebaseApp, REGION);

export type CreatedUser = {
  // The new account's Firebase UID, which is also their profile's id.
  uid: string;
  // False when the account was made but the welcome email didn't send,
  // so Manage users can say to pass the password on by hand.
  emailed: boolean;
};

// Throws with the function's own sentence (already-exists, a bad address,
// not a super user), which the caller can show as it is.
export async function createWaypointUser(
  name: string,
  email: string,
  password: string,
): Promise<CreatedUser> {
  const call = httpsCallable<{ name: string; email: string; password: string }, CreatedUser>(
    functions,
    "createWaypointUser",
  );
  try {
    const { data } = await call({ name: name.trim(), email: email.trim().toLowerCase(), password });
    return data;
  } catch (err) {
    throw new Error(friendlyError(err), { cause: err });
  }
}

function friendlyError(err: unknown): string {
  const e = err as Partial<FunctionsError>;
  if (e?.code === "functions/unavailable" || e?.code === "functions/internal") {
    return e.message || "Waypoint couldn't reach the server. Try again.";
  }
  if (e?.message) return e.message;
  return err instanceof Error ? err.message : String(err);
}
