// gone.js - finds friends whose account was deleted (their directory card is gone).
// Deleted accounts are hidden from Home, Friends and Followers lists. Their old chats stay in
// the Chat list as "Unknown user". Each friend is checked at most once every 6 hours (cached here).
import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const KEY = "lumio_gone_v1", TTL = 6 * 3600 * 1000;
function load() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } }

/** True when this person's account is gone (or the chat list already named them "Unknown user"). */
export function isGoneEntry(c) {
  if (!c) return true;
  if (c.name === "Unknown user") return true;
  const e = load()[c.uid];
  return !!(e && e.gone);
}

/** Checks the given people (items with a uid). Resolves true when a result changed, so the caller can re-render. */
export async function checkGone(list) {
  const m = load();
  const now = Date.now();
  let changed = false, any = false;
  const todo = (list || []).filter((c) => c && c.uid && !(m[c.uid] && now - m[c.uid].t < TTL)).slice(0, 40);
  for (const c of todo) {
    any = true;
    try {
      const s = await getDoc(doc(db, "directory", c.uid));
      const gone = !s.exists();
      if (!m[c.uid] || m[c.uid].gone !== gone) changed = true;
      m[c.uid] = { gone, t: now };
    } catch { /* offline: try again later */ }
  }
  if (any) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch {} }
  return changed;
}
