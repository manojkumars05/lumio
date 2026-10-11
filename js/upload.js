// =============================================================================
// upload.js - admin "add content" page (100% free version).
// There is no file upload and no Firebase Storage. You host the file anywhere
// that gives a direct https link (Cloudinary, Internet Archive, GitHub Pages...)
// and paste the link. Only the link + details are saved in Firestore.
//
// Who is an admin?  Anyone with a document at  admins/{their-uid}  in Firestore
// (created by hand in the console). The Security Rules enforce this on the
// server, so hiding the forms here is only a convenience, not the protection.
// =============================================================================

import { db } from "./firebase-config.js";
import { ensureProfile, renderUserChip, requireAuth } from "./auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, setFieldError, setLoading } from "./utils.js";

let currentUser;
let uploaderName = "Lumio member";

init();

async function init() {
  currentUser = await requireAuth();
  const profile = await ensureProfile(currentUser);
  uploaderName = profile.name;
  renderUserChip(currentUser, profile);

  const admin = await isAdmin(currentUser.uid);
  $("#checking").hidden = true;
  if (admin) {
    $("#adminArea").hidden = false;
  } else {
    $("#uidChip").textContent = currentUser.uid;
    $("#notAdmin").hidden = false;
  }
}

async function isAdmin(uid) {
  try {
    const snap = await getDoc(doc(db, "admins", uid));
    return snap.exists();
  } catch (err) {
    console.warn("Admin check failed:", err);
    return false;
  }
}

/* ---------------------------------------------------------------- helpers -- */

function showMessage(box, text, type) {
  box.className = `alert alert-${type}`;
  box.textContent = text;
  box.hidden = !text;
}

// Only secure https links are accepted (also enforced in firestore.rules).
function isHttps(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function checkTitle(input) {
  const ok = input.value.trim().length >= 2;
  setFieldError(input, ok ? "" : "Please enter a title (at least 2 characters).");
  return ok;
}

function checkUrl(input, { required = true } = {}) {
  const value = input.value.trim();
  let error = "";
  if (!value) error = required ? "Please paste a link." : "";
  else if (!isHttps(value)) error = "Enter a full link starting with https://";
  setFieldError(input, error);
  return !error;
}

/**
 * Loads the video's metadata to (a) confirm the link really plays and
 * (b) read its length. Resolves { ok, duration }. If the server is slow
 * (8s) we accept the link and save duration 0.
 */
function probeVideo(url) {
  return new Promise((resolve) => {
    const probe = document.createElement("video");
    probe.preload = "metadata";
    const finish = (result) => {
      clearTimeout(timer);
      probe.removeAttribute("src");
      probe.load();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: true, duration: 0 }), 8000);
    probe.onloadedmetadata = () =>
      finish({ ok: true, duration: Number.isFinite(probe.duration) ? Math.round(probe.duration) : 0 });
    probe.onerror = () => finish({ ok: false, duration: 0 });
    probe.src = url;
  });
}

/** Confirms an image link loads. */
function probeImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(true), 8000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}

/* ------------------------------------------------------------- video form -- */

$("#videoForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#videoMsg");
  showMessage(msg, "", "error");

  const titleOk = checkTitle($("#videoTitle"));
  const urlOk = checkUrl($("#videoUrl"));
  const thumbOk = checkUrl($("#thumbUrl"), { required: false });
  if (!titleOk || !urlOk || !thumbOk) return;

  const submit = $("#videoSubmit");
  setLoading(submit, true, "Checking link...");

  try {
    const videoUrl = $("#videoUrl").value.trim();
    const thumbnailUrl = $("#thumbUrl").value.trim();

    const { ok, duration } = await probeVideo(videoUrl);
    if (!ok) {
      setFieldError($("#videoUrl"), "This link can't be played. Use a direct link to an .mp4 or .webm file.");
      return;
    }

    if (thumbnailUrl && !(await probeImage(thumbnailUrl))) {
      setFieldError($("#thumbUrl"), "The thumbnail link didn't load as an image.");
      return;
    }

    const tags = $("#videoTags").value
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 10);

    setLoading(submit, true, "Saving...");
    await addDoc(collection(db, "videos"), {
      title: $("#videoTitle").value.trim(),
      description: $("#videoDescription").value.trim(),
      videoUrl,
      thumbnailUrl, // empty string = default thumbnail
      duration,
      tags,
      uploadedBy: currentUser.uid,
      uploaderName,
      createdAt: serverTimestamp(),
    });

    $("#videoForm").reset();
    showMessage(msg, "Video added! It now appears on the home page.", "success");
  } catch (err) {
    console.error(err);
    showMessage(msg, saveErrorText(err), "error");
  } finally {
    setLoading(submit, false);
  }
});

/* ------------------------------------------------------------- image form -- */

$("#imageForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#imageMsg");
  showMessage(msg, "", "error");

  const titleOk = checkTitle($("#imageTitle"));
  const urlOk = checkUrl($("#imageUrl"));
  if (!titleOk || !urlOk) return;

  const submit = $("#imageSubmit");
  setLoading(submit, true, "Checking link...");

  try {
    const imageUrl = $("#imageUrl").value.trim();
    if (!(await probeImage(imageUrl))) {
      setFieldError($("#imageUrl"), "This link didn't load as an image. Use a direct image link.");
      return;
    }

    setLoading(submit, true, "Saving...");
    await addDoc(collection(db, "images"), {
      title: $("#imageTitle").value.trim(),
      imageUrl,
      uploadedBy: currentUser.uid,
      uploaderName,
      createdAt: serverTimestamp(),
    });

    $("#imageForm").reset();
    showMessage(msg, "Photo added! It now appears in the gallery.", "success");
  } catch (err) {
    console.error(err);
    showMessage(msg, saveErrorText(err), "error");
  } finally {
    setLoading(submit, false);
  }
});

function saveErrorText(err) {
  const code = err?.code || "";
  if (code.includes("permission-denied"))
    return "Permission denied. Make sure your user ID is in the admins collection and the Firestore rules are published.";
  if (code.includes("unavailable") || code.includes("network")) return "Network problem. Please try again.";
  return "Could not save. Please try again.";
}
