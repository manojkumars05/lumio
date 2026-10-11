// =============================================================================
// settings.js - change display name and password.
// Name: updates Firebase Auth displayName + users/{uid}.name in Firestore.
// Password: re-checks the current password, then sets the new one (Firebase Auth only).
// =============================================================================

import { db } from "./firebase-config.js";
import { ensureProfile, friendlyAuthError, renderUserChip, requireAuth } from "./auth.js";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { setFieldError, setLoading } from "./utils.js";
import { ensureUserId, updateHandleName } from "./handle.js";

const nameForm = document.getElementById("nameForm");
const nameInput = document.getElementById("newName");
const phoneInput = document.getElementById("newPhone");
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

const user = await requireAuth();
let profile = await ensureProfile(user);
renderUserChip(user, profile);
nameInput.value = profile.name || "";
phoneInput.value = profile.phone || "";

// Your public ID (created the first time for older accounts)
let myId = "";
try {
  myId = await ensureUserId(user, profile.name);
  document.getElementById("myId").textContent = myId;
} catch (err) {
  console.error(err);
  document.getElementById("myId").textContent = "Unavailable";
}
document.getElementById("copyId").addEventListener("click", async (e) => {
  try { await navigator.clipboard.writeText(myId); e.target.textContent = "Copied!"; }
  catch { e.target.textContent = "Select & copy"; }
  setTimeout(() => (e.target.textContent = "Copy"), 1500);
});

document.getElementById("showPassword").addEventListener("change", (e) => {
  const type = e.target.checked ? "text" : "password";
  [currentPw, newPw, confirmPw].forEach((i) => (i.type = type));
});

// ---- Change name ------------------------------------------------------------
nameForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  show(nameMsg, "success", "");
  const name = nameInput.value.trim();

  if (name.length < 2) return setFieldError(nameInput, "Name must be at least 2 characters.");
  if (name.length > 80) return setFieldError(nameInput, "Name is too long (80 characters max).");
  setFieldError(nameInput, "");

  const phone = phoneInput.value.replace(/[\s-]/g, "");
  if (phone && !/^\+?[0-9]{10,15}$/.test(phone)) return setFieldError(phoneInput, "Enter a valid mobile number (10-15 digits).");
  setFieldError(phoneInput, "");

  setLoading(nameBtn, true, "Saving...");
  try {
    await updateProfile(user, { displayName: name });
    await updateDoc(doc(db, "users", user.uid), { name, phone });
    if (myId) await updateHandleName(myId, name);
    profile = { ...profile, name, phone };
    renderUserChip(user, profile);
    show(nameMsg, "success", "Saved.");
  } catch (err) {
    console.error(err);
    show(nameMsg, "error", "Could not update name. Please try again.");
  } finally {
    setLoading(nameBtn, false);
  }
});

// ---- Change password --------------------------------------------------------
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
