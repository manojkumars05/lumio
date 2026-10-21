// =============================================================================
// follow.js - follow / unfollow, followers and following lists, counts.
// follows/{followerUid}_{followeeUid} holds both names, so lists need no extra reads.
// Everything is cached on this device (lists 5 min, counts 5 min).
// =============================================================================
import { db } from "./firebase-config.js";
import {
  doc, getDoc, collection, query, where, limit, getDocs, getCountFromServer,
  writeBatch, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const TTL = 5 * 60 * 1000;
const COUNT_TTL = 30 * 1000;   // count queries cost 1 read each, so keep the numbers fresh
const lsGet = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? f; } catch { return f; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const myCard = () => lsGet("lumio_user", {});

/** Does me follow them? One small read. */
export async function isFollowing(me, them) {
  const snap = await getDoc(doc(db, "follows", me + "_" + them));
  return snap.exists();
}

/** p = { uid, name, id }. Also drops a "new follower" notice in their bell. */
export async function follow(me, p) {
  const c = myCard();
  const myName = c.name || "Member";
  const batch = writeBatch(db);
  batch.set(doc(db, "follows", me + "_" + p.uid), {
    followerId: me, followeeId: p.uid,
    followerName: myName, followerUserId: c.userId || "",
    followeeName: p.name || "User", followeeUserId: p.id || "",
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, "users", p.uid, "notifications", me), {
    type: "follow", fromUid: me, fromName: myName, createdAt: serverTimestamp(), read: false,
  });
  await batch.commit();
  const cur = lsGet("ix_following_" + me, { at: 0, items: [] });
  if (!cur.items.some((x) => x.uid === p.uid)) cur.items.unshift({ uid: p.uid, name: p.name, id: p.id, ms: Date.now() });
  lsSet("ix_following_" + me, cur);
  bumpCount(me, "following", 1);
}

export async function unfollow(me, themUid) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "follows", me + "_" + themUid));
  await batch.commit();
  const cur = lsGet("ix_following_" + me, { at: 0, items: [] });
  cur.items = cur.items.filter((x) => x.uid !== themUid);
  lsSet("ix_following_" + me, cur);
  bumpCount(me, "following", -1);
}

function bumpCount(me, key, d) {
  const c = lsGet("ix_fcounts_" + me, { at: 0, followers: 0, following: 0 });
  c[key] = Math.max(0, (c[key] || 0) + d);
  lsSet("ix_fcounts_" + me, c);
}
// When a full list is loaded (under the 100 limit) its length IS the exact count.
function setCount(me, key, n) {
  const c = lsGet("ix_fcounts_" + me, { at: 0, followers: 0, following: 0 });
  c[key] = n;
  lsSet("ix_fcounts_" + me, c);
}

async function fetchList(me, kind, force, ttl = TTL) {
  const key = "ix_" + kind + "_" + me;
  const c = lsGet(key, null);
  if (!force && c && Date.now() - c.at < ttl) return c.items;
  try {
    const mine = kind === "following";
    const snap = await getDocs(query(collection(db, "follows"), where(mine ? "followerId" : "followeeId", "==", me), limit(100)));
    const items = [];
    snap.forEach((d) => {
      const x = d.data();
      items.push({
        uid: mine ? x.followeeId : x.followerId,
        name: (mine ? x.followeeName : x.followerName) || "User",
        id: (mine ? x.followeeUserId : x.followerUserId) || "",
        ms: x.createdAt && x.createdAt.toMillis ? x.createdAt.toMillis() : 0,
      });
    });
    items.sort((a, b) => b.ms - a.ms);
    lsSet(key, { at: Date.now(), items });
    if (items.length < 100) setCount(me, kind, items.length);
    return items;
  } catch (e) {
    console.warn("Could not load " + kind + ":", e);
    return c ? c.items : [];
  }
}
export const getFollowing = (me, force, ttl) => fetchList(me, "following", force, ttl);
export const getFollowers = (me, force, ttl) => fetchList(me, "followers", force, ttl);
export const cachedFollowing = (me) => lsGet("ix_following_" + me, { items: [] }).items;

/** { followers, following } using cheap count queries (cached 5 min). */
export async function getCounts(me, force) {
  const c = lsGet("ix_fcounts_" + me, null);
  if (!force && c && Date.now() - c.at < COUNT_TTL) return c;
  try {
    const col = collection(db, "follows");
    const [a, b] = await Promise.all([
      getCountFromServer(query(col, where("followeeId", "==", me))),
      getCountFromServer(query(col, where("followerId", "==", me))),
    ]);
    const out = { at: Date.now(), followers: a.data().count, following: b.data().count };
    lsSet("ix_fcounts_" + me, out);
    return out;
  } catch (e) {
    console.warn("Could not load counts:", e);
    return c || { followers: 0, following: 0 };
  }
}
export const cachedCounts = (me) => lsGet("ix_fcounts_" + me, { followers: 0, following: 0 });
