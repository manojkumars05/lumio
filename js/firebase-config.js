// =============================================================================
// firebase-config.js
// Initialises Firebase once and exports the services every other file uses.
//
// STEP: paste YOUR web-app config below (Firebase console -> Project settings
// -> General -> "Your apps" -> Web app -> SDK setup and configuration -> Config).
//
// Is it safe to put this in frontend code?  YES. These values only *identify*
// your Firebase project. They are not secrets. What actually protects your data
// is Firebase Authentication + the Security Rules in firestore.rules and
// (and any other rules you add). NEVER put a service-account JSON / private key, Admin SDK
// credentials, or any "secret" key in this repo or in any frontend file.
// =============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCobyb4SZk6EwYH-O0uZdddhR9fWtZznj8",
  authDomain: "lumio-7ad40.firebaseapp.com",
  projectId: "lumio-7ad40",
  storageBucket: "lumio-7ad40.firebasestorage.app",
  messagingSenderId: "26935724683",
  appId: "1:26935724683:web:8bec32d15d2793c550a28e"
};

// True once you have replaced the placeholders above.
export const isConfigured = !firebaseConfig.apiKey.startsWith("YOUR_");

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
// Long-polling auto-detect: keeps live updates (chat) working on mobile
// networks / browsers where the normal WebSocket stream gets blocked or stalls.
// Persistent local cache (IndexedDB): pages and chats open instantly from the device
// and Firestore only downloads what changed, which keeps billed reads low.
// If the browser blocks IndexedDB (private mode), it falls back to the normal memory cache.
function makeDb() {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.warn("Persistent cache not available, using memory cache:", e);
    return initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  }
}
export const db = makeDb();
