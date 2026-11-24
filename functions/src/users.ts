// Adding someone to Waypoint from Settings → Manage users, account and all.
//
// Until now the only way in was for the person to sign themselves up and
// wait for a super user to approve the request. A super user can instead
// create the whole thing here: a Firebase Auth account on a starting
// password the super user picks as they add the person, their /designers
// profile (which is what the rules call membership, so they're in the
// moment it exists), and an email telling them they've been added and how
// to sign in.
//
// The starting password is known to the super user and goes out by email,
// so it's treated as single-use: the profile carries mustChangePassword,
// and the app holds the person at a change-password screen until they've
// chosen their own (src/components/ForcePasswordChange.tsx).
//
// Only the Admin SDK can make an account for somebody else — the web SDK
// would sign the super user out as itself — which is why this is a
// callable rather than something src/firestore.ts does directly.

import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { MAIL_SECRETS, sendMail } from "./graphMail";
import { renderEmail, type EmailContent } from "./emailTemplate";
import { ALLOWED_ORIGINS, SUPER_USER_EMAILS } from "./linkedin";

const REGION = "us-central1";

// Keep in step with WAYPOINT_APP_URL in index.ts.
const APP_URL = "https://lachlan-odea.github.io/waypoint/";

// Keep in step with ALLOWED_EMAIL_DOMAIN in src/constants.ts, and with the
// domain the rules hold /accessRequests to.
const ALLOWED_EMAIL_DOMAIN = "wisetechglobal.com";

// The starting password is typed by the super user for each person, so
// none is kept in this repo. These are the bounds on it: Firebase's own
// minimum (keep in step with MIN_PASSWORD_LENGTH in src/constants.ts) and
// a sane ceiling. It is never logged or stored by this function; it goes
// to Firebase Auth and into the one welcome email.
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;

// Keep in step with COLOR_PALETTE in src/firestore.ts.
const COLOR_PALETTE = [
  "#371ee1", "#6a5cd8", "#244349", "#a3294d", "#b4501f",
  "#2f6fb0", "#1f7a4d", "#1d1765", "#6b7a12", "#c2335f",
];

// initializeApp() runs in index.ts after this module has loaded, so the
// handles are fetched when first needed, not at import.
function db(): Firestore {
  return getFirestore();
}

type Caller = { uid: string; name: string };

// Creating a profile is what grants access, so this is held to super
// users exactly as the rules hold /designers: a signed-in (not anonymous)
// account whose designer profile carries the flag, or a bootstrap email.
async function requireSuperUser(req: CallableRequest<unknown>): Promise<Caller> {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in to Waypoint first.");
  if (auth.token.firebase?.sign_in_provider === "anonymous") {
    throw new HttpsError("permission-denied", "Sign in to Waypoint first.");
  }
  const snap = await db().collection("designers").doc(auth.uid).get();
  const designer = (snap.data() ?? {}) as { name?: string; isSuperUser?: boolean };
  const email = String(auth.token.email ?? "").toLowerCase();
  const allowed = designer.isSuperUser === true || SUPER_USER_EMAILS.includes(email);
  if (!allowed) {
    throw new HttpsError("permission-denied", "Only super users can add people to Waypoint.");
  }
  return { uid: auth.uid, name: (designer.name ?? "").trim() || email || "A super user" };
}

function initialsOf(name: string): string {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || "??";
}

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}

type CreateUserData = { name?: unknown; email?: unknown; password?: unknown };

// Make the account, the profile and the welcome email. Everything the
// caller passes is checked here: the callable is reachable by any
// signed-in account, so nothing from the client is trusted beyond the
// super-user check above.
export const createWaypointUser = onCall(
  {
    region: REGION,
    cors: ALLOWED_ORIGINS,
    secrets: MAIL_SECRETS,
    invoker: "public" as const,
  },
  async (req) => {
    const caller = await requireSuperUser(req);
    const data = (req.data ?? {}) as CreateUserData;

    const name = String(data.name ?? "").trim().replace(/\s+/g, " ");
    const email = String(data.email ?? "").trim().toLowerCase();
    // Not trimmed: a password is taken exactly as typed.
    const password = typeof data.password === "string" ? data.password : "";
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      throw new HttpsError(
        "invalid-argument",
        `Give them a starting password of at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
    }
    if (!name || name.length > 80) {
      throw new HttpsError("invalid-argument", "Give the person's full name (up to 80 characters).");
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new HttpsError("invalid-argument", "That doesn't look like a valid email address.");
    }
    if (!email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      throw new HttpsError(
        "invalid-argument",
        `Waypoint accounts are only for @${ALLOWED_EMAIL_DOMAIN} addresses.`,
      );
    }

    // Someone who already has an account signs in with the password they
    // chose; handing them a new one here would lock them out of nothing
    // and confuse everyone, so say what's actually going on instead. If
    // they're an account without a profile, they're waiting in Access
    // requests, which is where they should be approved.
    try {
      const existing = await getAuth().getUserByEmail(email);
      const profile = await db().collection("designers").doc(existing.uid).get();
      throw new HttpsError(
        "already-exists",
        profile.exists
          ? `${email} is already on Waypoint.`
          : `${email} already has an account and is waiting in Access requests. Approve them there.`,
      );
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      if ((err as { code?: string }).code !== "auth/user-not-found") {
        logger.error("Couldn't check for an existing account", { error: String(err) });
        throw new HttpsError("internal", "Couldn't check whether that address already has an account.");
      }
    }

    let uid: string;
    try {
      const user = await getAuth().createUser({
        email,
        // Created by a super user who knows the address, so there's
        // nothing for the person to verify: they're a member already.
        emailVerified: true,
        password,
        displayName: name,
      });
      uid = user.uid;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "auth/email-already-exists") {
        throw new HttpsError("already-exists", `${email} already has an account.`);
      }
      if (code === "auth/invalid-email") {
        throw new HttpsError("invalid-argument", "That doesn't look like a valid email address.");
      }
      if (code === "auth/invalid-password") {
        throw new HttpsError("invalid-argument", "Firebase wouldn't take that starting password. Try a longer one.");
      }
      logger.error("Couldn't create the account", { email, error: String(err) });
      throw new HttpsError("internal", "Couldn't create the account. Try again.");
    }

    // The profile is what lets them in, so it comes after the account and
    // carries the flag that holds them at the change-password screen. If
    // this write fails the account is taken back, rather than leaving a
    // sign-in that can't reach anything.
    try {
      const existing = await db().collection("designers").get();
      await db().collection("designers").doc(uid).set({
        id: uid,
        name,
        initials: initialsOf(name),
        color: COLOR_PALETTE[existing.size % COLOR_PALETTE.length],
        email,
        mustChangePassword: true,
      });
    } catch (err) {
      logger.error("Couldn't create the profile; taking the account back", { uid, error: String(err) });
      await getAuth()
        .deleteUser(uid)
        .catch((e) => logger.error("Couldn't delete the half-made account", { uid, error: String(e) }));
      throw new HttpsError("internal", "Couldn't create their Waypoint profile. Nothing was added; try again.");
    }

    // Last, because they're in whether or not mail is working, and a
    // failure here shouldn't undo the account.
    let emailed = true;
    const content: EmailContent = {
      kicker: "Welcome",
      heading: "You've been added to Waypoint",
      intro: `${caller.name} added you to Waypoint, the marketing team's project tool. Your account is ready: sign in with the address and starting password below, and Waypoint will ask you to choose your own password before you go any further.`,
      rows: [
        ["Sign in as", email],
        ["Starting password", password],
        ["Where", APP_URL],
      ],
      ctaLabel: "Open Waypoint",
      ctaUrl: APP_URL,
    };
    try {
      await sendMail({
        to: [email],
        subject: "[Waypoint] You've been added to Waypoint",
        html: renderEmail(firstNameOf(name), content),
      });
    } catch (err) {
      emailed = false;
      logger.error("Welcome email not sent", { uid, email, error: String(err) });
    }

    logger.info("Waypoint user created", { uid, email, by: caller.uid, emailed });
    return { uid, emailed };
  },
);
