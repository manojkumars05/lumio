// =============================================================================
// forgot.js - "Forgot password": saves a request in Firestore (passwordRequests)
// for the admin to approve, and opens WhatsApp with a ready message (Tanglish).
// =============================================================================

import { db } from "./firebase-config.js";
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { normalizeId } from "./handle.js";
import { setFieldError, setLoading, setMessage } from "./utils.js";
import { ADMIN_WHATSAPP } from "./reset-config.js";

const form = document.getElementById("forgotForm");
const input = document.getElementById("ident");
const btn = document.getElementById("submitBtn");
const err = document.getElementById("formError");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMessage(err, "");
  let ident = input.value.trim();
  if (ident.length < 3) return setFieldError(input, "Enter your username, ID or email.");
  setFieldError(input, "");

  const id = normalizeId(ident);
  ident = id || ident.toLowerCase().replace(/^@/, "");

  setLoading(btn, true, "Sending...");
  try {
    const ref = await addDoc(collection(db, "passwordRequests"), {
      identifier: ident,
      status: "pending",
      createdAt: serverTimestamp(),
    });
    try { localStorage.setItem("ix_reset_req", ref.id); } catch {}

    const code = ref.id.slice(0, 6).toUpperCase();
    document.getElementById("code").textContent = code;
    const text = `Hello Admin, I have requested a password reset on InfiniX.\nUsername/ID/Email: ${ident}\nRequest code: ${code}\nPlease approve my request. Thank you!`;
    const url = `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(text)}`;
    document.getElementById("waBtn").href = url;
    document.getElementById("sent").hidden = false;
    form.hidden = true;
    window.open(url, "_blank", "noopener"); // if the browser blocks it, the button above still works
  } catch (ex) {
    console.error(ex);
    setMessage(err, "Could not send the request. Check your connection and try again.");
  } finally {
    setLoading(btn, false);
  }
});
