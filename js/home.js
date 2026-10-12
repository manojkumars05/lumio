// =============================================================================
// home.js - the home page: video feed, search and photo gallery.
// =============================================================================

import { ensureProfile, renderUserChip, requireAuth } from "./auth.js";
import { fetchImages, fetchVideos } from "./data.js";
import {
  $,
  PLACEHOLDER_THUMB,
  debounce,
  escapeHTML,
  formatDate,
  formatDuration,
} from "./utils.js";

const grid = $("#videoGrid");
const resultsInfo = $("#resultsInfo");
const searchInput = $("#searchInput");
const searchForm = $("#searchForm");

let allVideos = [];
let allImages = [];

const PLAY_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';

init();

async function init() {
  const user = await requireAuth(); // redirects to login.html if signed out
  if (!grid.querySelector(".skeleton")) renderSkeletons();

  // Pre-fill the search box from ?q=... (used by the search box on the watch page).
  const initialQuery = new URLSearchParams(location.search).get("q") || "";
  searchInput.value = initialQuery;

  // Run everything at the same time instead of one after another.
  const profileDone = ensureProfile(user).then((profile) => renderUserChip(user, profile));
  await Promise.all([profileDone, loadVideos(), loadImages()]);
}

/* ---------------------------------------------------------------- videos -- */

async function loadVideos() {
  try {
    const { videos, demo } = await fetchVideos();
    allVideos = videos;
    $("#demoNotice").hidden = !demo;
    applySearch();
  } catch (err) {
    console.error(err);
    showError(
      err?.code === "permission-denied"
        ? "Firestore denied access. Publish firestore.rules (see README) and make sure you're logged in."
        : "We couldn't load videos. Check your connection and try again."
    );
  } finally {
    grid.setAttribute("aria-busy", "false");
  }
}

function renderSkeletons(count = 8) {
  grid.innerHTML = Array.from({ length: count }, () => `
    <div class="video-card skeleton" aria-hidden="true">
      <div class="thumb"></div>
      <div class="card-body"><div class="line"></div><div class="line short"></div></div>
    </div>`).join("");
}

function videoCard(v) {
  const duration = formatDuration(v.duration);
  const href = `watch.html?id=${encodeURIComponent(v.id)}`;
  return `
    <article class="video-card">
      <a class="video-card-link" href="${href}" aria-label="Watch ${escapeHTML(v.title)}">
        <div class="thumb">
          <img src="${escapeHTML(v.thumbnailUrl || PLACEHOLDER_THUMB)}" alt="" loading="lazy" width="640" height="360">
          ${duration ? `<span class="duration-badge">${duration}</span>` : ""}
          <span class="thumb-play" aria-hidden="true">${PLAY_ICON}</span>
        </div>
        <div class="card-body">
          <h3 class="card-title">${escapeHTML(v.title)}</h3>
          <p class="card-desc">${escapeHTML(v.description || "")}</p>
          <p class="card-meta">
            ${v.uploaderName ? `<span>${escapeHTML(v.uploaderName)}</span>` : ""}
            <span>${escapeHTML(formatDate(v.createdAt))}</span>
          </p>
        </div>
      </a>
    </article>`;
}

function renderVideos(videos, query = "") {
  if (!videos.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8.5 11h5"/></svg>
        <h3>${query ? "No videos match your search" : "No videos yet"}</h3>
        <p>${query ? `Nothing found for "${escapeHTML(query)}". Try a different word.` : "Check back soon, or upload the first one."}</p>
        ${query ? '<button class="btn btn-ghost" type="button" id="clearSearch">Clear search</button>' : ""}
      </div>`;
    $("#clearSearch")?.addEventListener("click", () => {
      searchInput.value = "";
      applySearch();
      searchInput.focus();
    });
    return;
  }
  grid.innerHTML = videos.map(videoCard).join("");
  // If a thumbnail fails to load, swap in the placeholder.
  grid.querySelectorAll(".thumb img").forEach((img) =>
    img.addEventListener("error", () => (img.src = PLACEHOLDER_THUMB), { once: true })
  );
}

function showError(message) {
  grid.innerHTML = `
    <div class="empty-state" role="alert">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.01"/></svg>
      <h3>Something went wrong</h3>
      <p>${escapeHTML(message)}</p>
      <button class="btn btn-primary" type="button" id="retryBtn"><span class="btn-label">Try again</span></button>
    </div>`;
  resultsInfo.textContent = "";
  $("#retryBtn").addEventListener("click", () => {
    renderSkeletons();
    grid.setAttribute("aria-busy", "true");
    loadVideos();
  });
}

/* ---------------------------------------------------------------- search -- */

// A video matches when EVERY word typed appears in its title, description,
// tags or uploader name (case-insensitive).
function applySearch() {
  const query = searchInput.value.trim();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  const matches = words.length
    ? allVideos.filter((v) => {
        const haystack = [v.title, v.description, v.uploaderName, ...(v.tags || [])]
          .join(" ")
          .toLowerCase();
        return words.every((w) => haystack.includes(w));
      })
    : allVideos;

  renderVideos(matches, query);
  resultsInfo.textContent = query
    ? `${matches.length} result${matches.length === 1 ? "" : "s"} for "${query}"`
    : allVideos.length
    ? `${allVideos.length} video${allVideos.length === 1 ? "" : "s"}`
    : "";
  $("#videosTitle").textContent = query ? "Search results" : "Latest videos";

  // Keep the URL shareable without adding history entries.
  const url = new URL(location.href);
  if (query) url.searchParams.set("q", query);
  else url.searchParams.delete("q");
  history.replaceState(null, "", url);
}

searchInput.addEventListener("input", debounce(applySearch, 180));
searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  applySearch();
});

/* ---------------------------------------------------------------- photos -- */

async function loadImages() {
  try {
    const { images } = await fetchImages();
    allImages = images;
    if (!images.length) return;
    $("#photoGrid").innerHTML = images
      .map(
        (img, i) => `
        <button class="photo" type="button" data-index="${i}" aria-label="View photo: ${escapeHTML(img.title)}">
          <img src="${escapeHTML(img.imageUrl)}" alt="${escapeHTML(img.title)}" loading="lazy">
          <span>${escapeHTML(img.title)}</span>
        </button>`
      )
      .join("");
    $("#photosSection").hidden = false;
  } catch (err) {
    // The photo section is optional - just leave it hidden if it can't load.
    console.warn("Photos could not be loaded:", err);
  }
}

const lightbox = $("#lightbox");
$("#photoGrid").addEventListener("click", (e) => {
  const btn = e.target.closest(".photo");
  if (!btn) return;
  const image = allImages[Number(btn.dataset.index)];
  $("#lightboxImg").src = image.imageUrl;
  $("#lightboxImg").alt = image.title;
  $("#lightboxCaption").textContent = image.title;
  lightbox.showModal();
});
$("#lightboxClose").addEventListener("click", () => lightbox.close());
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) lightbox.close(); // click on the dark backdrop
});
