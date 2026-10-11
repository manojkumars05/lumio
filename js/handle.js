// =============================================================================
// handle.js - every user gets a short public ID like SMR-48213.
// handles/{ID} -> { uid, name } lets people find each other by ID without
// anyone being able to list all users or see emails.
// =============================================================================

import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/** "lum-48213", "48213" or " SMR-48213 " -> "SMR-48213". Returns null if invalid. */
export function normalizeId(raw) {
  const m = String(raw || "").trim().toUpperCase().replace(/\s+/g, "").match(/^(?:SMR-?)?(\d{5})$/);
  return m ? `SMR-${m[1]}` : null;
}

/** Returns the user's ID, creating one the first time (also for old accounts). */
export async function ensureUserId(user, name) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (snap.exists() && snap.data().userId) return snap.data().userId;

  for (let i = 0; i < 10; i++) {
    const id = "SMR-" + (10000 + Math.floor(Math.random() * 90000));
    try {
      // Fails with permission-denied if that ID is already taken.
      await setDoc(doc(db, "handles", id), { uid: user.uid, name: name || "Member" });
    } catch (err) {
      if (err.code === "permission-denied") continue;
      throw err;
    }
    await updateDoc(userRef, { userId: id });
    return id;
  }
  throw new Error("Could not create a unique ID. Please try again.");
}

/** Looks up an ID. Returns { id, uid, name } or null. */
export async function findByUserId(id) {
  const snap = await getDoc(doc(db, "handles", id));
  return snap.exists() ? { id, ...snap.data() } : null;
}

/** Keep the public name in sync after a name change. */
export async function updateHandleName(id, name) {
  await updateDoc(doc(db, "handles", id), { name });
}
