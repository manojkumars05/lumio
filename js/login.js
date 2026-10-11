// =============================================================================
// login.js - login page logic. Firebase Authentication keeps the user signed in
// (session persistence is the default: the user stays logged in across visits
// until they click "Log out").
// =============================================================================

import { auth } from "./firebase-config.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
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
    await signInWithEmailAndPassword(auth, email, password);
    location.replace("home.html");
  } catch (err) {
    console.error(err);
    busy = false;
    setLoading(submitBtn, false);
    setMessage(formError, friendlyAuthError(err));
  }
});
