// =============================================================================
// utils.js - small helpers shared by several pages (no Firebase code here).
// =============================================================================

/** Shortcut for document.querySelector. */
export const $ = (selector, root = document) => root.querySelector(selector);

/** Escape text before putting it inside an HTML string (prevents XSS). */
export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}

const pad = (n) => String(n).padStart(2, "0");

/** 125 -> "2:05", 3725 -> "1:02:05". Returns "" when unknown. */
export function formatDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return "";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Accepts a Firestore Timestamp, ISO string, number or Date. */
export function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "11 Oct 2026" (uses the visitor's locale). */
export function formatDate(value) {
  const d = toDate(value);
  return d ? d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
}

/** "3 days ago", falls back to a normal date after a month. */
export function timeAgo(value) {
  const d = toDate(value);
  if (!d) return "";
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const units = [
    ["minute", 60],
    ["hour", 3600],
    ["day", 86400],
    ["week", 604800],
  ];
  for (let i = units.length - 1; i >= 0; i--) {
    const [name, size] = units[i];
    if (seconds >= size) {
      const n = Math.floor(seconds / size);
      if (name === "week" && n > 4) break;
      return `${n} ${name}${n > 1 ? "s" : ""} ago`;
    }
  }
  return formatDate(d);
}

/** Delay a function until the user stops typing. */
export function debounce(fn, wait = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** Show an inline error under a form field (needs an element with id "<input id>-error"). */
export function setFieldError(input, message) {
  const slot = document.getElementById(`${input.id}-error`);
  if (slot) slot.textContent = message || "";
  input.setAttribute("aria-invalid", message ? "true" : "false");
}

/** Show / hide a message box (the element should have the `hidden` attribute by default). */
export function setMessage(box, message) {
  if (!box) return;
  box.textContent = message || "";
  box.hidden = !message;
}

/** Toggle a button's loading state (spinner + disabled). */
export function setLoading(button, loading, loadingText) {
  const label = button.querySelector(".btn-label");
  const spinner = button.querySelector(".spinner");
  if (label && !button.dataset.label) button.dataset.label = label.textContent;
  button.disabled = loading;
  button.setAttribute("aria-busy", String(loading));
  if (spinner) spinner.hidden = !loading;
  if (label) label.textContent = loading && loadingText ? loadingText : button.dataset.label;
}

export const PLACEHOLDER_THUMB = "assets/thumbnails/placeholder.svg";
