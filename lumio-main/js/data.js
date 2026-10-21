// =============================================================================
// data.js - reads videos and images from Firestore.
// Used by home.js and watch.js. If a collection is empty, the demo data from
// sample-data.js is returned instead (and `demo: true` is set).
// =============================================================================

import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { SAMPLE_IMAGES, SAMPLE_VIDEOS } from "./sample-data.js";

export async function fetchVideos(max = 60) {
  const q = query(collection(db, "videos"), orderBy("createdAt", "desc"), limit(max));
  const snap = await getDocs(q);
  const videos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return videos.length ? { videos, demo: false } : { videos: SAMPLE_VIDEOS, demo: true };
}

export async function fetchVideo(id) {
  if (id.startsWith("sample-")) return SAMPLE_VIDEOS.find((v) => v.id === id) || null;
  const snap = await getDoc(doc(db, "videos", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function fetchImages(max = 24) {
  const q = query(collection(db, "images"), orderBy("createdAt", "desc"), limit(max));
  const snap = await getDocs(q);
  const images = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return images.length ? { images, demo: false } : { images: SAMPLE_IMAGES, demo: true };
}
