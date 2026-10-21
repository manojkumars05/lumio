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
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { formatDate } from "./utils.js";
import { ensureUserId } from "./handle.js";

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
      if (!user) { location.replace("login.html"); return; }
      // Older accounts have no username yet: show the "Choose your username" screen first.
      ensureUsername(user).catch((e) => console.warn(e)).finally(() => resolve(user));
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
  try {
    localStorage.removeItem("lumio_user");
    // Clear the per-device caches (chat list, themes, unread badge) of this account.
    Object.keys(localStorage).filter((k) => k.startsWith("ix_")).forEach((k) => localStorage.removeItem(k));
  } catch {}
  try {
    await signOut(auth);
  } finally {
    location.replace("login.html");
  }
}


/* ------------------------------------------------------------ username --- */

/** Small letters, numbers, _ and . only, 5 to 20 characters. */
export const USERNAME_RE = /^[a-z0-9_.]{5,20}$/;

/** Returns an error message, or "" when the username format is valid. */
export function usernameError(u) {
  if (!u) return "Username is required.";
  if (u.length < 5 || u.length > 20) return "Username must be 5 to 20 characters.";
  if (!USERNAME_RE.test(u)) return "Use only small letters, numbers, _ and .";
  return "";
}

/** Date of birth as YYYY-MM-DD. Returns an error message, or "" when valid. */
export function dobError(v) {
  if (!v) return "Date of birth is required.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "Enter a valid date of birth.";
  const d = new Date(v + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "Enter a valid date of birth.";
  const now = new Date();
  if (d > now) return "Date of birth cannot be in the future.";
  if (d.getFullYear() < 1900) return "Enter a valid date of birth.";
  return "";
}

/**
 * If the signed-in user has no username (accounts made before usernames existed),
 * show a full-screen "Choose your username" step and wait until it is saved.
 * Uses the locally cached copy first, so normal visits cost zero reads.
 */
export async function ensureUsername(user) {
  try {
    const c = JSON.parse(localStorage.getItem("lumio_user") || "null");
    if (c && c.uid === user.uid && c.username) return;
  } catch {}
  const profile = await ensureProfile(user);
  if (profile._fallback) return; // offline / error: do not block the app
  if (profile.username) {
    cacheUser({ uid: user.uid, name: profile.name, email: user.email || "", username: profile.username, dob: profile.dob });
    return;
  }
  await showUsernameScreen(user, profile);
}

function showUsernameScreen(user, profile) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "ix-gate";
    wrap.innerHTML = `
      <div class="auth-card ix-gate-card" role="dialog" aria-modal="true" aria-labelledby="ixGateTitle">
        <img src="assets/images/logo.svg" alt="" width="56" height="56">
        <h1 id="ixGateTitle">Choose your username</h1>
        <p class="lead">InfiniX now uses usernames. Pick one to continue.</p>
        <div id="ixGateErr" class="alert alert-error" role="alert" hidden></div>
        <form id="ixGateForm" novalidate>
          <div class="field">
            <label for="ixUser">Username</label>
            <input id="ixUser" type="text" maxlength="20" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="e.g. manoj_kumar" required>
            <div class="hint">5 to 20 characters: small letters, numbers, _ and . only.</div>
            <div class="field-error" id="ixUser-error" aria-live="polite"></div>
          </div>
          ${profile.dob ? "" : `
          <div class="field">
            <label for="ixDob">Date of birth <span class="muted">(optional)</span></label>
            <input id="ixDob" type="date" autocomplete="bday" max="${new Date().toISOString().slice(0, 10)}">
            <div class="field-error" id="ixDob-error" aria-live="polite"></div>
          </div>`}
          <button class="btn btn-primary btn-block" type="submit" id="ixGateBtn">
            <span class="spinner" hidden></span><span class="btn-label">Continue</span>
          </button>
        </form>
      </div>`;
    document.body.appendChild(wrap);

    const input = wrap.querySelector("#ixUser");
    const dobInput = wrap.querySelector("#ixDob");
    const btn = wrap.querySelector("#ixGateBtn");
    const err = wrap.querySelector("#ixGateErr");
    input.focus();
    input.addEventListener("input", () => { input.value = input.value.toLowerCase(); setFieldErr(input, ""); });

    function setFieldErr(el, msg) {
      const slot = wrap.querySelector("#" + el.id + "-error");
      if (slot) slot.textContent = msg || "";
      el.setAttribute("aria-invalid", msg ? "true" : "false");
    }

    wrap.querySelector("#ixGateForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      err.hidden = true;
      const u = input.value.trim();
      const ue = usernameError(u);
      if (ue) return setFieldErr(input, ue);
      let dob = "";
      if (dobInput && dobInput.value) {
        const de = dobError(dobInput.value);
        if (de) return setFieldErr(dobInput, de);
        dob = dobInput.value;
      }
      btn.disabled = true;
      wrap.querySelector(".spinner").hidden = false;
      try {
        // Claim the username (fails with permission-denied if somebody already has it).
        try {
          await setDoc(doc(db, "usernames", u), { uid: user.uid, name: profile.name || "Member" });
        } catch (claimErr) {
          if (claimErr.code === "permission-denied") { setFieldErr(input, "Username not available"); return; }
          throw claimErr;
        }
        const patch = { username: u };
        if (dob) patch.dob = dob;
        await updateDoc(doc(db, "users", user.uid), patch);
        // Publish the InfiniX ID next to the username (so Search can find this user by username).
        try {
          const userId = await ensureUserId(user, profile.name);
          await updateDoc(doc(db, "usernames", u), { userId });
        } catch (idErr) { console.warn(idErr); }
        cacheUser({ uid: user.uid, name: profile.name, email: user.email || "", username: u, dob: dob || profile.dob });
        wrap.remove();
        resolve();
      } catch (ex) {
        console.error(ex);
        err.textContent = "Could not save your username. Check your connection and try again.";
        err.hidden = false;
      } finally {
        btn.disabled = false;
        wrap.querySelector(".spinner")?.setAttribute("hidden", "");
      }
    });
  });
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
    _fallback: true,
  };
  try {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data();
    await setDoc(ref, { name: fallback.name, email: fallback.email, createdAt: serverTimestamp() });
    return { name: fallback.name, email: fallback.email, createdAt: null };
  } catch (err) {
    console.warn("Could not load or create the user profile:", err);
    return fallback;
  }
}

/**
 * Same data as ensureProfile(), but skips the Firestore read when this device already
 * loaded the profile in the last few minutes (saves one read on every page open).
 * Block / unblock is still enforced instantly by the Firestore rules; the app notices
 * a block on the next refresh (default 10 minutes).
 */
export async function getProfileCached(user, ttlMs = 10 * 60 * 1000) {
  try {
    const c = JSON.parse(localStorage.getItem("lumio_user") || "null");
    if (c && c.uid === user.uid && c.userId && c.username && c.name && c.checkedAt && Date.now() - c.checkedAt < ttlMs) {
      return { name: c.name, email: c.email || user.email || "", userId: c.userId, username: c.username, dob: c.dob || "", photo: c.photo || "", chatTheme: c.chatTheme, msgTheme: c.msgTheme, _cached: true };
    }
  } catch {}
  const p = await ensureProfile(user);
  if (!p._fallback) {
    cacheUser({ uid: user.uid, name: p.name, email: user.email || "", userId: p.userId, username: p.username, dob: p.dob, photo: p.photo, chatTheme: p.chatTheme, msgTheme: p.msgTheme, checkedAt: Date.now() });
  }
  return p;
}

/** Fill the header chip (avatar initials, name, email) and any profile card. */
export function renderUserChip(user, profile) {
  if (profile && profile.blocked === true) {
    try { sessionStorage.setItem("ix_blocked", "1"); } catch {}
    logout();
    return;
  }
  const name = profile?.name || user.displayName || "Member";
  const initials =
    name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

  document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = name));
  document.querySelectorAll("[data-user-first-name]").forEach((el) => (el.textContent = name.split(/\s+/)[0]));
  document.querySelectorAll("[data-user-email]").forEach((el) => (el.textContent = user.email || ""));
  let photo = profile?.photo || "";
  if (!photo) { try { photo = JSON.parse(localStorage.getItem("lumio_user") || "{}").photo || ""; } catch {} }
  const hasPhoto = typeof photo === "string" && /^(data:image\/|https:\/\/res\.cloudinary\.com\/)/.test(photo);
  document.querySelectorAll("[data-user-avatar]").forEach((el) => {
    el.textContent = hasPhoto ? "" : initials;
    el.classList.toggle("has-photo", hasPhoto);
    el.style.backgroundImage = hasPhoto ? "url(" + photo + ")" : "";
  });
  const since = formatDate(profile?.createdAt) || formatDate(user.metadata?.creationTime);
  document.querySelectorAll("[data-user-since]").forEach((el) => {
    el.textContent = since ? `Member since ${since}` : "";
  });
  cacheUser({ uid: user.uid, name, email: user.email || "", since: since || "", userId: profile?.userId, username: profile?.username, dob: profile?.dob, photo: profile?.photo, chatTheme: profile?.chatTheme, msgTheme: profile?.msgTheme, checkedAt: profile?._cached ? undefined : Date.now() });
}

/** Remember the user locally so the next page load can show name/ID instantly (js/boot.js). */
export function cacheUser(fields) {
  try {
    let old = JSON.parse(localStorage.getItem("lumio_user") || "null") || {};
    if (old.uid !== fields.uid) old = {};
    const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== ""));
    const merged = { ...old, ...clean };
    localStorage.setItem("lumio_user", JSON.stringify(merged));
  } catch {}
}

/** Turns Firebase error codes into messages a human can act on. */
export function friendlyAuthError(err) {
  switch (err?.code) {
    case "app/username-taken":
      return "Username not available";
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
