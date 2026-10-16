// =============================================================================
// settings.js - Settings menu: Profile, Password and Security, Privacy Policy,
// Help, Logout.
// Profile: name + date of birth are editable; username, email and ID are not.
// Password: re-checks the current password, then sets the new one.
// =============================================================================

import { db } from "./firebase-config.js";
import { dobError, ensureProfile, friendlyAuthError, logout, renderUserChip, requireAuth } from "./auth.js";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { setFieldError, setLoading } from "./utils.js";
import { ensureUserId, updateHandleName } from "./handle.js";
import { imageToDataUrl } from "./photo.js";
import { cacheUser } from "./auth.js";

/* ------------------------------------------------------------- views --- */
const views = [...document.querySelectorAll("[data-view]")];
function route() {
  const name = (location.hash || "").replace("#", "");
  const target = views.some((v) => v.dataset.view === name) ? name : "menu";
  views.forEach((v) => (v.hidden = v.dataset.view !== target));
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
route();

// "Download the app" makes no sense inside the installed app.
try {
  const inApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ||
    /; wv\)/.test(navigator.userAgent) ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;
  if (inApp) document.getElementById("dlLink").hidden = true;
} catch {}

document.getElementById("logoutBtn").addEventListener("click", logout);

/* ----------------------------------------------------------- elements --- */
const nameForm = document.getElementById("nameForm");
const nameInput = document.getElementById("newName");
const dobInput = document.getElementById("newDob");
const nameBtn = document.getElementById("nameBtn");
const nameMsg = document.getElementById("nameMsg");

const pwForm = document.getElementById("pwForm");
const pwBtn = document.getElementById("pwBtn");
const pwMsg = document.getElementById("pwMsg");
const currentPw = document.getElementById("currentPassword");
const newPw = document.getElementById("newPassword");
const confirmPw = document.getElementById("confirmPassword");

function show(box, type, text) {
  box.className = `alert alert-${type}`;
  box.textContent = text;
  box.hidden = !text;
}

/* ------------------------------------------------------------ profile --- */
const user = await requireAuth();
let profile = await ensureProfile(user);
renderUserChip(user, profile);
nameInput.value = profile.name || "";
dobInput.value = profile.dob || "";
dobInput.max = new Date().toISOString().slice(0, 10);
document.getElementById("usernameShow").value = profile.username || "";
document.getElementById("emailShow").value = user.email || profile.email || "";

// Your public ID (created the first time for older accounts)
let myId = "";
try {
  myId = (JSON.parse(localStorage.getItem("lumio_user") || "{}").userId) || profile.userId || "";
  if (myId) document.getElementById("myId").textContent = myId;
  myId = await ensureUserId(user, profile.name);
  document.getElementById("myId").textContent = myId;
} catch (err) {
  console.error(err);
  if (!myId) document.getElementById("myId").textContent = "Unavailable";
}
document.getElementById("copyId").addEventListener("click", async (e) => {
  try { await navigator.clipboard.writeText(myId); e.target.textContent = "Copied!"; }
  catch { e.target.textContent = "Select & copy"; }
  setTimeout(() => (e.target.textContent = "Copy"), 1500);
});

/* ------------------------------------------------------- profile photo --- */
const photoFile = document.getElementById("photoFile");
const photoMsg = document.getElementById("photoMsg");
document.getElementById("photoPen").addEventListener("click", () => photoFile.click());
photoFile.addEventListener("change", async () => {
  const file = photoFile.files && photoFile.files[0];
  photoFile.value = "";
  if (!file) return;
  photoMsg.style.color = "";
  photoMsg.textContent = "Saving photo...";
  try {
    // Small square JPEG (256 px) so it stays light on every page and in Firestore.
    const photo = await imageToDataUrl(file, { max: 256, quality: 0.8, maxChars: 38000, square: true });
    const batch = writeBatch(db);
    batch.update(doc(db, "users", user.uid), { photo });
    if (myId) batch.update(doc(db, "handles", myId), { photo });
    await batch.commit();
    profile = { ...profile, photo };
    cacheUser({ uid: user.uid, photo });
    renderUserChip(user, profile);
    photoMsg.textContent = "Photo saved.";
  } catch (err) {
    console.error(err);
    photoMsg.style.color = "var(--danger)";
    photoMsg.textContent = err && err.message && /image/i.test(err.message) ? err.message : "Could not save your photo. Please try again.";
  }
});

nameForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  show(nameMsg, "success", "");
  const name = nameInput.value.trim();

  if (name.length < 2) return setFieldError(nameInput, "Name must be at least 2 characters.");
  if (name.length > 80) return setFieldError(nameInput, "Name is too long (80 characters max).");
  setFieldError(nameInput, "");

  const dob = dobInput.value;
  if (dob) {
    const de = dobError(dob);
    if (de) return setFieldError(dobInput, de);
  }
  setFieldError(dobInput, "");

  setLoading(nameBtn, true, "Saving...");
  try {
    await updateProfile(user, { displayName: name });
    await updateDoc(doc(db, "users", user.uid), { name, dob });
    if (myId) { try { await updateHandleName(myId, name); } catch (err) { console.warn(err); } }
    if (profile.username && name !== profile.name) {
      try { await updateDoc(doc(db, "usernames", profile.username), { name }); } catch (err) { console.warn(err); }
    }
    profile = { ...profile, name, dob };
    renderUserChip(user, profile);
    show(nameMsg, "success", "Saved.");
  } catch (err) {
    console.error(err);
    show(nameMsg, "error", "Could not save your profile. Please try again.");
  } finally {
    setLoading(nameBtn, false);
  }
});

/* ----------------------------------------------------------- password --- */
document.getElementById("showPassword").addEventListener("change", (e) => {
  const type = e.target.checked ? "text" : "password";
  [currentPw, newPw, confirmPw].forEach((i) => (i.type = type));
});

pwForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  show(pwMsg, "error", "");

  const errors = {};
  if (!currentPw.value) errors.current = "Enter your current password.";
  if (newPw.value.length < 8) errors.next = "Password must be at least 8 characters.";
  else if (!/[A-Za-z]/.test(newPw.value) || !/\d/.test(newPw.value))
    errors.next = "Include at least one letter and one number.";
  else if (newPw.value === currentPw.value) errors.next = "New password must be different.";
  if (confirmPw.value !== newPw.value) errors.confirm = "Passwords do not match.";

  setFieldError(currentPw, errors.current);
  setFieldError(newPw, errors.next);
  setFieldError(confirmPw, errors.confirm);
  if (Object.keys(errors).length) return;

  setLoading(pwBtn, true, "Updating...");
  try {
    const credential = EmailAuthProvider.credential(user.email, currentPw.value);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPw.value);
    pwForm.reset();
    show(pwMsg, "success", "Password updated.");
  } catch (err) {
    console.error(err);
    if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
      setFieldError(currentPw, "Current password is incorrect.");
    } else {
      show(pwMsg, "error", friendlyAuthError(err));
    }
  } finally {
    setLoading(pwBtn, false);
  }
});


/* ----------------------------------------------------------- invite friends --- */
// Shown inside the installed app and on laptops / desktops. Hidden in a phone's browser.
(function invite() {
  const menuItem = document.getElementById("inviteLink");
  const ua = navigator.userAgent;
  const phone = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  let installed = false;
  try {
    installed = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ||
      /; wv\)/.test(ua) || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  } catch {}
  if (phone && !installed) { menuItem.hidden = true; return; }
  menuItem.hidden = false;

  const $i = (id) => document.getElementById(id);
  const first = () => String((profile && profile.name) || "").trim().split(/\s+/)[0] || "A friend";
  function inviteUrl() {
    const u = new URL("invite.html", location.href);
    u.search = ""; u.hash = "";
    u.searchParams.set("n", first());
    if (myId) u.searchParams.set("ref", myId);
    return u.toString();
  }
  const message = () => first() + " invited you to InfiniX - chat without limits. Join here:";
  function fill() {
    const url = inviteUrl(), text = message();
    $i("inviteUrl").value = url;
    $i("inviteWa").href = "https://wa.me/?text=" + encodeURIComponent(text + " " + url);
    $i("inviteTg").href = "https://t.me/share/url?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(text);
    $i("inviteMail").href = "mailto:?subject=" + encodeURIComponent("Join me on InfiniX") + "&body=" + encodeURIComponent(text + "\n" + url);
    $i("inviteShare").textContent = navigator.share ? "Share invite" : "Copy invite link";
  }
  fill();
  window.addEventListener("hashchange", () => { if (location.hash === "#invite") fill(); });

  async function copy() {
    const url = inviteUrl(), msg = $i("inviteMsg");
    try { await navigator.clipboard.writeText(message() + " " + url); msg.textContent = "Invite copied. Paste it in any chat."; }
    catch { const f = $i("inviteUrl"); f.select(); try { document.execCommand("copy"); msg.textContent = "Link copied."; } catch { msg.textContent = "Press and hold the link to copy it."; } }
  }
  $i("inviteCopy").addEventListener("click", copy);
  $i("inviteShare").addEventListener("click", async () => {
    if (!navigator.share) return copy();
    try { await navigator.share({ title: "Join me on InfiniX", text: message(), url: inviteUrl() }); }
    catch (e) { if (!e || e.name !== "AbortError") copy(); }   // closing the sheet is not an error
  });
})();
