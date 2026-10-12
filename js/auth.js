// =============================================================================
// auth.js - shared authentication helpers.
// Firebase Authentication does the real work (hashing passwords, sessions,
// keeping the user signed in across visits). We never see or store a password.
// =============================================================================

import { auth, db, isConfigured } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { formatDate } from "./utils.js";

/**
 * Protects a page. Resolves with the signed-in user, or sends the visitor to
 * login.html. Firebase restores the session automatically, so refreshing the
 * page keeps you logged in.
 */
export function requireAuth() {
  return new Promise((resolve) => {
    if (!isConfigured) {
      location.replace("login.html");
      return;
    }
    const stop = onAuthStateChanged(auth, (user) => {
      stop();
      if (user) resolve(user);
      else location.replace("login.html");
    });
  });
}

/**
 * On login/register pages: if the visitor is already signed in, go to Home.
 * `isBusy` lets register.js pause the redirect while it is still saving the profile.
 */
export function redirectIfLoggedIn(isBusy = () => false) {
  if (!isConfigured) return;
  onAuthStateChanged(auth, (user) => {
    if (user && !isBusy()) location.replace("home.html");
  });
}

/** Sign out and return to the login page. */
export async function logout() {
  try { localStorage.removeItem("lumio_user"); } catch {}
  try {
    await signOut(auth);
  } finally {
    location.replace("login.html");
  }
}

/**
 * Reads users/{uid}. If the profile document is missing (for example the
 * network dropped during registration) it is created now.
 */
export async function ensureProfile(user, fallbackName = "") {
  const fallback = {
    name: user.displayName || fallbackName || (user.email || "Member").split("@")[0],
    email: user.email || "",
    createdAt: null,
  };
  try {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data();
    await setDoc(ref, { name: fallback.name, email: fallback.email, createdAt: serverTimestamp() });
    return fallback;
  } catch (err) {
    console.warn("Could not load or create the user profile:", err);
    return fallback;
  }
}

/** Fill the header chip (avatar initials, name, email) and any profile card. */
export function renderUserChip(user, profile) {
  const name = profile?.name || user.displayName || "Member";
  const initials =
    name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

  document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = name));
  document.querySelectorAll("[data-user-first-name]").forEach((el) => (el.textContent = name.split(/\s+/)[0]));
  document.querySelectorAll("[data-user-email]").forEach((el) => (el.textContent = user.email || ""));
  document.querySelectorAll("[data-user-avatar]").forEach((el) => {
    el.textContent = initials;
    el.style.backgroundImage = "";
  });
  const since = formatDate(profile?.createdAt) || formatDate(user.metadata?.creationTime);
  document.querySelectorAll("[data-user-since]").forEach((el) => {
    el.textContent = since ? `Member since ${since}` : "";
  });
  cacheUser({ uid: user.uid, name, email: user.email || "", since: since || "", userId: profile?.userId });
}

/** Remember the user locally so the next page load can show name/ID instantly (js/boot.js). */
export function cacheUser(fields) {
  try {
    let old = JSON.parse(localStorage.getItem("lumio_user") || "null") || {};
    if (old.uid !== fields.uid) old = {};
    const merged = { ...old, ...fields };
    if (!fields.userId) merged.userId = old.userId;
    localStorage.setItem("lumio_user", JSON.stringify(merged));
  } catch {}
}

/** Turns Firebase error codes into messages a human can act on. */
export function friendlyAuthError(err) {
  switch (err?.code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try logging in instead.";
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/weak-password":
      return "Choose a stronger password (at least 8 characters).";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/operation-not-allowed":
      return "Email/Password sign-in is not enabled. Enable it in Firebase console -> Authentication -> Sign-in method.";
    case "auth/api-key-not-valid":
    case "auth/invalid-api-key":
      return "The Firebase API key is invalid. Check js/firebase-config.js.";
    default:
      return "Something went wrong. Please try again.";
  }
}

/** Show the "configure Firebase" warning box on pages that have #configWarning. */
export function showConfigWarning() {
  const box = document.getElementById("configWarning");
  if (box && !isConfigured) box.hidden = false;
  return !isConfigured;
}

// Any element with data-logout becomes a logout button.
document.querySelectorAll("[data-logout]").forEach((btn) => btn.addEventListener("click", logout));
