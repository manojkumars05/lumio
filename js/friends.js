// =============================================================================
// friends.js - Friends (people you chat with), Followers and Following.
// Friends come from this device (0 reads). Followers / Following are fetched when a tab
// is opened, then cached for 5 minutes. Counts use cheap count queries (cached 5 min).
// =============================================================================

import { requireAuth } from "./auth.js";
import { applyPhoto } from "./avatars.js";
import { follow, unfollow, getFollowers, getFollowing, getCounts, cachedCounts, cachedFollowing } from "./follow.js";

const user = await requireAuth();
const uid = user.uid;
const box = document.getElementById("list");
const empty = document.getElementById("empty");
const lsGet = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? f; } catch { return f; } };

const EMPTY = {
  friends: "No friends yet. Use Search to find someone and send a message.",
  followers: "No followers yet.",
  following: "You are not following anyone yet. Use Search to find people.",
};
let tab = "friends";
let followingSet = new Set(cachedFollowing(uid).map((x) => x.uid));

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

function openChat(p) {
  const list = lsGet("lumio_contacts_" + uid, []);
  if (!list.some((c) => c.uid === p.uid)) {
    list.unshift({ uid: p.uid, name: p.name, id: p.id, photo: p.photo || "", at: Date.now() });
    try { localStorage.setItem("lumio_contacts_" + uid, JSON.stringify(list)); } catch {}
  }
  location.href = "chat.html?open=" + encodeURIComponent(p.uid);
}

function row(p, withFollow) {
  const r = el("article", "ix-person");
  const av = el("span", "avatar avatar-lg", initials(p.name));
  applyPhoto(av, p.uid, p.id, p.photo);
  const t = el("div", "ix-person-text");
  t.append(el("strong", "", p.name || "User"), el("small", "", p.id || ""));
  const actions = el("div", "ix-actions");
  if (withFollow) {
    const fb = el("button", "btn btn-sm");
    fb.type = "button";
    const paint = () => { const f = followingSet.has(p.uid); fb.textContent = f ? "Following" : (tab === "followers" ? "Follow back" : "Follow"); fb.classList.toggle("btn-ghost", f); fb.classList.toggle("btn-primary", !f); };
    paint();
    fb.addEventListener("click", async () => {
      const f = followingSet.has(p.uid);
      if (f && !confirm("Unfollow " + (p.name || "this user") + "?")) return;
      fb.disabled = true;
      try {
        if (f) { await unfollow(uid, p.uid); followingSet.delete(p.uid); }
        else { await follow(uid, p); followingSet.add(p.uid); }
        paintCounts(cachedCounts(uid));
        if (tab === "following" && f) { r.remove(); if (!box.children.length) show("following"); }
      } catch (e) { console.error(e); alert("Could not update. Check your connection and try again."); }
      finally { fb.disabled = false; paint(); }
    });
    actions.append(fb);
  }
  const mb = el("button", "btn btn-ghost btn-sm", "Message");
  mb.type = "button";
  mb.addEventListener("click", () => openChat(p));
  actions.append(mb);
  r.append(av, t, actions);
  return r;
}

function paintCounts(c) {
  document.getElementById("cFollowers").textContent = c.followers || 0;
  document.getElementById("cFollowing").textContent = c.following || 0;
}

function render(items, withFollow, key) {
  box.replaceChildren();
  empty.hidden = items.length > 0;
  empty.textContent = EMPTY[key];
  items.forEach((p) => box.append(row(p, withFollow)));
}

async function show(name) {
  tab = name;
  document.querySelectorAll(".ix-tab[data-tab]").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
  if (name === "friends") return render(lsGet("lumio_contacts_" + uid, []), false, name);
  // Show the saved copy at once, then refresh if it is older than 5 minutes.
  const cached = lsGet("ix_" + name + "_" + uid, null);
  if (cached) render(cached.items, true, name); else { box.replaceChildren(); empty.hidden = true; }
  const items = await (name === "followers" ? getFollowers(uid, false, 60000) : getFollowing(uid, false, 60000));
  if (tab !== name) return;
  if (name === "following") followingSet = new Set(items.map((x) => x.uid));
  else followingSet = new Set(cachedFollowing(uid).map((x) => x.uid));
  render(items, true, name);
  paintCounts(cachedCounts(uid));
}

document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));

// Someone just followed you. sidebar.js already notices this once (1 read, no timer) and fires
// this event: show +1 straight away, then fetch the exact number, and refresh the list if it is open.
window.addEventListener("ix:followers", () => {
  paintCounts(cachedCounts(uid));
  getCounts(uid, true).then(paintCounts);
  if (tab === "followers") show("followers");
});

paintCounts(cachedCounts(uid));
// Someone just followed me: the sidebar listener fires this once, so refresh once.
window.addEventListener("ix:followers", () => {
  paintCounts(cachedCounts(uid));
  getCounts(uid, true).then(paintCounts);
  if (tab === "followers") show("followers");
});
show("friends");
getCounts(uid, true).then(paintCounts);
getFollowing(uid, false, 60000).then((items) => { followingSet = new Set(items.map((x) => x.uid)); });
