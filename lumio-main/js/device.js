// device.js - a short device label saved at login, shown only to admins (user details sheet).
import { db } from "./firebase-config.js";
import { doc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export function deviceInfo() {
  const ua = navigator.userAgent || "";
  let os = "", model = "", br = "";
  if (/Android/.test(ua)) {
    os = "Android";
    const m = /Android [^;]*;\s*([^;)]+)\)/.exec(ua);
    model = m ? m[1].trim() : "";
  }
  else if (/iPhone/.test(ua)) os = "iPhone";
  else if (/iPad/.test(ua)) os = "iPad";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "Mac";
  else if (/Linux/.test(ua)) os = "Linux";
  if (/SamsungBrowser/.test(ua)) br = "Samsung Internet";
  else if (/Edg\//.test(ua)) br = "Edge";
  else if (/OPR\//.test(ua)) br = "Opera";
  else if (/Firefox/.test(ua)) br = "Firefox";
  else if (/Chrome/.test(ua)) br = "Chrome";
  else if (/Safari/.test(ua)) br = "Safari";
  const app = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true ? "Lumio app" : "";
  return [os, model, app || br].filter(Boolean).join(" · ");
}

export async function saveDevice(uid) {
  try {
    await updateDoc(doc(db, "users", uid), { device: deviceInfo(), lastLoginAt: serverTimestamp() });
  } catch (e) { console.warn("Could not save device info:", e); }
}
