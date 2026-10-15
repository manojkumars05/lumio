// =============================================================================
// register.js - registration page logic.
// Fields: name, username (required, unique), email, date of birth, password.
// 1. Validate   2. Create the account in Firebase Authentication
// 3. Claim the username (usernames/{username})   4. Claim the mailbox
// 5. Save the profile in Firestore (users/{uid})   6. Go to Home.
// The password only goes to Firebase Authentication. It is NEVER written to Firestore.
// =============================================================================

import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  deleteUser,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { friendlyAuthError, redirectIfLoggedIn, showConfigWarning, USERNAME_RE, usernameError, dobError } from "./auth.js";
import { ensureUserId } from "./handle.js";
import { setFieldError, setLoading, setMessage, debounce } from "./utils.js";

/** One real mailbox = one account. Gmail ignores dots and +tags, so
 *  a.b+x@gmail.com and ab@gmail.com are the SAME inbox. */
function emailKey(email) {
  let [local, domain] = String(email).trim().toLowerCase().split("@");
  local = local.split("+")[0];
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return local + "@" + domain;
}

const form = document.getElementById("registerForm");
const submitBtn = document.getElementById("submitBtn");
const formError = document.getElementById("formError");
const fields = {
  name: document.getElementById("name"),
  username: document.getElementById("username"),
  email: document.getElementById("email"),
  dob: document.getElementById("dob"),
  password: document.getElementById("password"),
};
fields.dob.max = new Date().toISOString().slice(0, 10);

let busy = false; // stops the "already logged in" redirect while we are still saving the profile

showConfigWarning();
redirectIfLoggedIn(() => busy);

document.getElementById("showPassword").addEventListener("change", (e) => {
  fields.password.type = e.target.checked ? "text" : "password";
});

// Usernames are always small letters: convert while typing.
fields.username.addEventListener("input", () => {
  const v = fields.username.value;
  const lower = v.toLowerCase();
  if (v !== lower) fields.username.value = lower;
});

// Returns an error message for each invalid field (empty string = valid).
function validate() {
  const v = {
    name: fields.name.value.trim(),
    username: fields.username.value.trim(),
    email: fields.email.value.trim(),
    dob: fields.dob.value,
    password: fields.password.value,
  };
  const errors = {};

  if (v.name.length < 2) errors.name = "Please enter your full name (at least 2 characters).";
  else if (v.name.length > 80) errors.name = "Name is too long (80 characters max).";

  const ue = usernameError(v.username);
  if (ue) errors.username = ue;

  if (!v.email) errors.email = "Email is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errors.email = "Enter a valid email address.";

  const de = dobError(v.dob);
  if (de) errors.dob = de;

  if (!v.password) errors.password = "Password is required.";
  else if (v.password.length < 8) errors.password = "Password must be at least 8 characters.";
  else if (!/[A-Za-z]/.test(v.password) || !/\d/.test(v.password))
    errors.password = "Include at least one letter and one number.";

  return { values: v, errors };
}

// Live "Username not available" check (1 small read, only after the format is valid).
const checkUsername = debounce(async () => {
  const u = fields.username.value.trim();
  if (usernameError(u)) return;
  try {
    const snap = await getDoc(doc(db, "usernames", u));
    if (fields.username.value.trim() === u) setFieldError(fields.username, snap.exists() ? "Username not available" : "");
  } catch { /* the final check happens when the account is created */ }
}, 500);
fields.username.addEventListener("input", checkUsername);

Object.entries(fields).forEach(([key, input]) => {
  input.addEventListener("blur", () => {
    if (!input.value && !input.dataset.touched) return;
    input.dataset.touched = "1";
    if (key === "username" && input.getAttribute("aria-invalid") === "true" && !usernameError(input.value.trim())) return; // keep "not available"
    setFieldError(input, validate().errors[key]);
  });
  input.addEventListener("input", () => {
    if (key === "username") return; // handled above
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

    // 1a) Claim the username. If somebody else owns it, undo and stop.
    try {
      await setDoc(doc(db, "usernames", values.username), { uid: cred.user.uid, name: values.name });
    } catch (claimErr) {
      if (claimErr.code === "permission-denied") {
        try { await deleteUser(cred.user); } catch (e) { console.warn(e); }
        throw Object.assign(new Error("username-taken"), { code: "app/username-taken" });
      }
      throw claimErr;
    }

    // 1b) Claim this mailbox. If another account already claimed it, undo and stop.
    try {
      await setDoc(doc(db, "emailKeys", emailKey(values.email)), { uid: cred.user.uid });
    } catch (claimErr) {
      if (claimErr.code === "permission-denied") {
        try { await deleteUser(cred.user); } catch (e) { console.warn(e); }
        throw Object.assign(new Error("email-taken"), { code: "auth/email-already-in-use" });
      }
      throw claimErr;
    }

    // 2) Keep the display name on the auth user too.
    await updateProfile(cred.user, { displayName: values.name });

    // 3) Profile data goes to Firestore. No password.
    try {
      await setDoc(doc(db, "users", cred.user.uid), {
        name: values.name,
        email: values.email,
        username: values.username,
        dob: values.dob,
        createdAt: serverTimestamp(),
      });
    } catch (profileErr) {
      // The account exists, so continue. The username screen / ensureProfile repairs a missing profile.
      console.warn("Profile document could not be saved:", profileErr);
    }

    // 4) Give the new user their InfiniX ID and publish it next to the username
    //    so people can find them by username too. Not fatal if it fails: Settings/Chat retry.
    try {
      const userId = await ensureUserId(cred.user, values.name);
      await updateDoc(doc(db, "usernames", values.username), { userId });
    } catch (idErr) {
      console.warn("Could not create the InfiniX ID yet:", idErr);
    }

    location.replace("home.html");
  } catch (err) {
    console.error(err);
    busy = false;
    setLoading(submitBtn, false);
    if (err?.code === "app/username-taken") {
      setFieldError(fields.username, "Username not available");
      fields.username.focus();
    } else {
      setMessage(formError, friendlyAuthError(err));
    }
  }
});
