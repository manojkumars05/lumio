// =============================================================================
// forgot.js - "Forgot password": saves a request in Firestore (passwordRequests)
// for the admin to approve, and opens WhatsApp with a ready message (English).
// =============================================================================

import { normalizeId } from "./handle.js";
import { setFieldError, setLoading, setMessage } from "./utils.js";
import { ADMIN_WHATSAPP, REQUEST_API_URL } from "./reset-config.js";

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
    // The server checks that the account exists, then saves the request for the admin.
    let res, data = {};
    try {
      res = await fetch(REQUEST_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: ident }),
      });
      data = await res.json().catch(() => ({}));
    } catch (netErr) {
      throw new Error("Network error. Check your connection and try again.");
    }
    if (!res.ok || !data.requestId) throw new Error(data.error || "Could not send the request. Please try again.");
    const ref = { id: data.requestId };
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
    setMessage(err, ex && ex.message ? ex.message : "Could not send the request. Check your connection and try again.");
  } finally {
    setLoading(btn, false);
  }
});
