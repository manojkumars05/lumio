// =============================================================================
// register.js - registration page logic.
// 1. Validate the form   2. Create the account in Firebase Authentication
// 3. Save name + email in Firestore (users/{uid})   4. Redirect to home.html
// The password only goes to Firebase Authentication. It is NEVER written to Firestore.
// =============================================================================

import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { friendlyAuthError, redirectIfLoggedIn, showConfigWarning } from "./auth.js";
import { setFieldError, setLoading, setMessage } from "./utils.js";

const form = document.getElementById("registerForm");
const submitBtn = document.getElementById("submitBtn");
const formError = document.getElementById("formError");
const fields = {
  name: document.getElementById("name"),
  email: document.getElementById("email"),
  phone: document.getElementById("phone"),
  password: document.getElementById("password"),
  confirmPassword: document.getElementById("confirmPassword"),
};

let busy = false; // stops the "already logged in" redirect while we are still saving the profile

showConfigWarning();
redirectIfLoggedIn(() => busy);

// Show / hide passwords
document.getElementById("showPassword").addEventListener("change", (e) => {
  const type = e.target.checked ? "text" : "password";
  fields.password.type = type;
  fields.confirmPassword.type = type;
});

// Returns an error message for each invalid field (empty string = valid).
function validate() {
  const v = {
    name: fields.name.value.trim(),
    email: fields.email.value.trim(),
    phone: fields.phone.value.replace(/[\s-]/g, ""),
    password: fields.password.value,
    confirmPassword: fields.confirmPassword.value,
  };
  const errors = {};

  if (v.name.length < 2) errors.name = "Please enter your full name (at least 2 characters).";
  else if (v.name.length > 80) errors.name = "Name is too long (80 characters max).";

  if (!v.email) errors.email = "Email is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errors.email = "Enter a valid email address.";

  if (!v.phone) errors.phone = "Mobile number is required.";
  else if (!/^\+?[0-9]{10,15}$/.test(v.phone)) errors.phone = "Enter a valid mobile number (10-15 digits).";

  if (!v.password) errors.password = "Password is required.";
  else if (v.password.length < 8) errors.password = "Password must be at least 8 characters.";
  else if (!/[A-Za-z]/.test(v.password) || !/\d/.test(v.password))
    errors.password = "Include at least one letter and one number.";

  if (!v.confirmPassword) errors.confirmPassword = "Please confirm your password.";
  else if (v.confirmPassword !== v.password) errors.confirmPassword = "Passwords do not match.";

  return { values: v, errors };
}

// Re-validate a field as soon as the user leaves it.
Object.entries(fields).forEach(([key, input]) => {
  input.addEventListener("blur", () => {
    if (!input.value && !input.dataset.touched) return;
    input.dataset.touched = "1";
    setFieldError(input, validate().errors[key]);
  });
  input.addEventListener("input", () => {
    if (input.getAttribute("aria-invalid") === "true") setFieldError(input, validate().errors[key]);
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(formError, "");

  if (showConfigWarning()) return;

  const { values, errors } = validate();
  Object.entries(fields).forEach(([key, input]) => setFieldError(input, errors[key]));
  const firstBad = Object.keys(errors)[0];
  if (firstBad) {
    fields[firstBad].focus();
    return;
  }

  busy = true;
  setLoading(submitBtn, true, "Creating account...");

  try {
    // 1) Firebase Authentication hashes and stores the password. We never touch it.
    const cred = await createUserWithEmailAndPassword(auth, values.email, values.password);

    // 2) Keep the display name on the auth user too.
    await updateProfile(cred.user, { displayName: values.name });

    // 3) Public-profile data goes to Firestore: name, email, createdAt. No password.
    try {
      await setDoc(doc(db, "users", cred.user.uid), {
        name: values.name,
        email: values.email,
        phone: values.phone,
        createdAt: serverTimestamp(),
      });
    } catch (profileErr) {
      // The account exists, so continue. home.js re-creates the profile if it is missing.
      console.warn("Profile document could not be saved:", profileErr);
    }

    // 4) Done - go to the home page.
    location.replace("home.html");
  } catch (err) {
    console.error(err);
    busy = false;
    setLoading(submitBtn, false);
    setMessage(formError, friendlyAuthError(err));
  }
});
