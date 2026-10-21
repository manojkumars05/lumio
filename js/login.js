// =============================================================================
// login.js - login page logic. Firebase Authentication keeps the user signed in
// (session persistence is the default: the user stays logged in across visits
// until they click "Log out").
// =============================================================================

import { auth, db } from "./firebase-config.js";
import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { RESET_API_URL } from "./reset-config.js";
import { saveDevice } from "./device.js";
import { friendlyAuthError, redirectIfLoggedIn, showConfigWarning } from "./auth.js";
import { setFieldError, setLoading, setMessage } from "./utils.js";

const form = document.getElementById("loginForm");
const submitBtn = document.getElementById("submitBtn");
const formError = document.getElementById("formError");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

let busy = false;

showConfigWarning();
redirectIfLoggedIn(() => busy); // already signed in? skip straight to Home

document.getElementById("showPassword").addEventListener("change", (e) => {
  passwordInput.type = e.target.checked ? "text" : "password";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(formError, "");

  if (showConfigWarning()) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  let valid = true;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setFieldError(emailInput, "Enter a valid email address.");
    emailInput.focus();
    valid = false;
  } else {
    setFieldError(emailInput, "");
  }
  if (!password) {
    setFieldError(passwordInput, "Password is required.");
    if (valid) passwordInput.focus();
    valid = false;
  } else {
    setFieldError(passwordInput, "");
  }
  if (!valid) return;

  busy = true;
  setLoading(submitBtn, true, "Logging in...");
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    saveDevice(cred.user.uid);
    // Blocked by the admin? Then sign out again.
    try {
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      if (snap.exists() && snap.data().blocked === true) {
        await signOut(auth);
        busy = false;
        setLoading(submitBtn, false);
        setMessage(formError, "Your account has been blocked. Please contact the admin.");
        return;
      }
    } catch (e) { console.warn(e); }
    location.replace("home.html");
  } catch (err) {
    console.error(err);
    busy = false;
    setLoading(submitBtn, false);
    setMessage(formError, friendlyAuthError(err));
  }
});


/* -------------------------------------------------- password reset status -- */
// If this device sent a "forgot password" request, show where it stands.
// Once the admin approves it, "Set new password" appears here.
const resetInfo = document.getElementById("resetInfo");
const resetBox = document.getElementById("resetBox");
const resetForm = document.getElementById("resetForm");
const resetBtn = document.getElementById("resetBtn");
const rpw = document.getElementById("rpw");
const rpw2 = document.getElementById("rpw2");

try { if (sessionStorage.getItem("ix_blocked")) { sessionStorage.removeItem("ix_blocked"); setMessage(formError, "Your account has been blocked. Please contact the admin."); } } catch {}

let reqId = null;
try { reqId = localStorage.getItem("ix_reset_req"); } catch {}
if (reqId) checkRequest();

async function checkRequest() {
  const info = (text, type = "warn") => { resetInfo.className = `alert alert-${type}`; resetInfo.textContent = text; resetInfo.hidden = !text; };
  try {
    const snap = await getDoc(doc(db, "passwordRequests", reqId));
    const status = snap.exists() ? snap.data().status : "gone";
    if (status === "pending") info("Your password reset request is waiting for admin approval.");
    else if (status === "approved") { info(""); resetBox.hidden = false; }
    else {
      if (status === "rejected") info("Your password reset request was rejected by the admin.", "error");
      try { localStorage.removeItem("ix_reset_req"); } catch {}
    }
  } catch (e) { console.warn(e); }
}

resetForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const p = rpw.value;
  let bad = false;
  if (p.length < 8 || !/[A-Za-z]/.test(p) || !/\d/.test(p)) { setFieldError(rpw, "Use 8+ characters with at least one letter and one number."); bad = true; } else setFieldError(rpw, "");
  if (rpw2.value !== p) { setFieldError(rpw2, "Passwords do not match."); bad = true; } else setFieldError(rpw2, "");
  if (bad) return;
  if (RESET_API_URL.includes("YOUR-PROJECT")) { setMessage(formError, "Password reset service is not set up yet."); return; }

  setLoading(resetBtn, true, "Saving...");
  setMessage(formError, "");
  try {
    const res = await fetch(RESET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: reqId, newPassword: p }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not set the password.");
    try { localStorage.removeItem("ix_reset_req"); } catch {}
    resetBox.hidden = true;
    resetInfo.className = "alert alert-success";
    resetInfo.textContent = "Password changed. Log in with your new password.";
    resetInfo.hidden = false;
  } catch (ex) {
    setMessage(formError, ex.message || "Could not set the password.");
  } finally {
    setLoading(resetBtn, false);
  }
});
