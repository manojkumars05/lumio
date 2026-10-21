// cleanup-orphans.mjs - removes profile data of accounts that no longer exist in Firebase Auth
// (for example, accounts deleted from the Firebase console). Runs with the Admin SDK, so the
// Firestore rules do not apply here. Chat messages are NOT deleted (they stay, shown as "Unknown user").
//
// Needs the env var FIREBASE_SERVICE_ACCOUNT (the service-account JSON, kept as a GitHub Secret).
// DRY_RUN=true (default) only prints what it WOULD delete. Set DRY_RUN=false to really delete.
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "null");
if (!sa) { console.error("FIREBASE_SERVICE_ACCOUNT is missing."); process.exit(1); }
const DRY = (process.env.DRY_RUN || "true").toLowerCase() !== "false";

initializeApp({ credential: cert(sa) });
const auth = getAuth();
const db = getFirestore();

// 1) every login that exists in Firebase Auth
const authIds = new Set();
let page;
do {
  const res = await auth.listUsers(1000, page);
  res.users.forEach((u) => authIds.add(u.uid));
  page = res.pageToken;
} while (page);
console.log(`Firebase Auth accounts: ${authIds.size}`);

// 2) profile docs that have no login any more
const users = await db.collection("users").get();
let removed = 0;
for (const d of users.docs) {
  if (authIds.has(d.id)) continue;
  const x = d.data();
  console.log(`${DRY ? "[dry run] would remove" : "removing"} profile of ${d.id} (${x.userId || "no ID"})`);
  if (!DRY) {
    const b = db.batch();
    if (x.username) b.delete(db.collection("usernames").doc(x.username));
    if (x.userId) b.delete(db.collection("handles").doc(x.userId));
    b.delete(db.collection("directory").doc(d.id));
    b.delete(d.ref);
    await b.commit();
  }
  removed++;
}

// 3) directory cards with no profile and no login
const dirs = await db.collection("directory").get();
for (const d of dirs.docs) {
  if (authIds.has(d.id)) continue;
  console.log(`${DRY ? "[dry run] would remove" : "removing"} directory card ${d.id}`);
  if (!DRY) await d.ref.delete();
  removed++;
}

console.log(`${DRY ? "Would remove" : "Removed"} ${removed} item(s).`);
