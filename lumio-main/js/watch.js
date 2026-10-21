// =============================================================================
// watch.js - the video player page (watch.html?id=VIDEO_ID).
// Loads one video from Firestore (or the demo data), wires up the custom
// controls and lists other videos under "Up next".
// =============================================================================

import { ensureProfile, renderUserChip, requireAuth } from "./auth.js";
import { fetchVideo, fetchVideos } from "./data.js";
import { $, PLACEHOLDER_THUMB, escapeHTML, formatDate, formatDuration } from "./utils.js";

const player = $("#player");
const video = $("#video");
const bigPlay = $("#bigPlay");
const playBtn = $("#playBtn");
const seek = $("#seek");
const volume = $("#volume");
const muteBtn = $("#muteBtn");
const fsBtn = $("#fsBtn");
const status = $("#playerStatus");

const videoId = new URLSearchParams(location.search).get("id");

init();

async function init() {
  const user = await requireAuth();
  const profile = await ensureProfile(user);
  renderUserChip(user, profile);

  if (!videoId) return showNotFound();

  setStatus("loading");
  try {
    const [current, list] = await Promise.all([fetchVideo(videoId), fetchVideos(13)]);
    if (!current) return showNotFound();
    renderVideo(current);
    renderUpNext(list.videos.filter((v) => v.id !== current.id).slice(0, 12));
  } catch (err) {
    console.error(err);
    showNotFound(
      "We couldn't load this video",
      err?.code === "permission-denied"
        ? "Firestore denied access. Publish firestore.rules (see README)."
        : "Check your connection and try again."
    );
  }
}

/* ----------------------------------------------------------- page content -- */

function renderVideo(v) {
  document.title = `${v.title} - Lumio`;
  $("#videoTitle").textContent = v.title;
  $("#videoDesc").textContent = v.description || "No description provided.";
  $("#uploaderName").textContent = v.uploaderName || "Lumio member";
  $("#uploaderAvatar").textContent = (v.uploaderName || "L")[0].toUpperCase();
  $("#videoDate").textContent = formatDate(v.createdAt) ? `Uploaded ${formatDate(v.createdAt)}` : "";
  $("#tagList").innerHTML = (v.tags || []).map((t) => `<span class="tag">#${escapeHTML(t)}</span>`).join("");
  $("#watchMeta").hidden = false;

  // NOTE: no `autoplay` attribute anywhere - the visitor must press play.
  video.poster = v.thumbnailUrl || "";
  video.src = v.videoUrl;
  video.load();
}

function renderUpNext(videos) {
  const box = $("#upNext");
  if (!videos.length) {
    box.innerHTML = '<p class="muted">No other videos yet.</p>';
    return;
  }
  box.innerHTML = videos
    .map(
      (v) => `
      <a class="mini-card" href="watch.html?id=${encodeURIComponent(v.id)}">
        <div class="thumb">
          <img src="${escapeHTML(v.thumbnailUrl || PLACEHOLDER_THUMB)}" alt="" loading="lazy">
          ${v.duration ? `<span class="duration-badge">${formatDuration(v.duration)}</span>` : ""}
        </div>
        <div>
          <h3>${escapeHTML(v.title)}</h3>
          <p>${escapeHTML(v.uploaderName || "")}</p>
          <p>${escapeHTML(formatDate(v.createdAt))}</p>
        </div>
      </a>`
    )
    .join("");
  box.querySelectorAll("img").forEach((img) =>
    img.addEventListener("error", () => (img.src = PLACEHOLDER_THUMB), { once: true })
  );
}

function showNotFound(title, text) {
  status.classList.remove("show");
  player.hidden = true;
  $("#watchMeta").hidden = true;
  if (title) $("#watchErrorTitle").textContent = title;
  if (text) $("#watchErrorText").textContent = text;
  $("#watchError").hidden = false;
}

/* ---------------------------------------------------------------- player -- */

function setStatus(kind) {
  if (kind === "loading") {
    status.innerHTML = '<div class="spinner"></div><span>Loading video...</span>';
    status.classList.add("show");
  } else if (kind === "error") {
    status.innerHTML = "<strong>This video can't be played.</strong><span>The file may be missing or in an unsupported format.</span>";
    status.classList.add("show");
  } else {
    status.classList.remove("show");
  }
}

const fmt = (s) => formatDuration(Math.max(s, 0.01)) || "0:00";
const setFill = (input) => {
  const pct = ((input.value - input.min) / (input.max - input.min || 1)) * 100;
  input.style.setProperty("--fill", `${pct}%`);
};

function togglePlay() {
  if (video.paused || video.ended) video.play().catch(() => setStatus("error"));
  else video.pause();
}

bigPlay.addEventListener("click", togglePlay);
playBtn.addEventListener("click", togglePlay);
video.addEventListener("click", togglePlay);

video.addEventListener("play", () => {
  player.classList.add("is-playing");
  playBtn.setAttribute("aria-label", "Pause");
  bigPlay.setAttribute("aria-label", "Play video");
});
video.addEventListener("pause", () => {
  player.classList.remove("is-playing", "is-idle");
  playBtn.setAttribute("aria-label", "Play");
});
video.addEventListener("ended", () => player.classList.remove("is-playing", "is-idle"));

// Metadata ready -> show duration. Waiting/playing -> spinner.
video.addEventListener("loadedmetadata", () => {
  setStatus("");
  $("#durationTime").textContent = fmt(video.duration);
  seek.max = video.duration;
  setFill(seek);
});
video.addEventListener("waiting", () => setStatus("loading"));
video.addEventListener("canplay", () => setStatus(""));
video.addEventListener("playing", () => setStatus(""));
video.addEventListener("error", () => setStatus("error"));

// Progress bar
video.addEventListener("timeupdate", () => {
  if (!seek.matches(":active")) seek.value = video.currentTime;
  $("#currentTime").textContent = video.currentTime ? fmt(video.currentTime) : "0:00";
  setFill(seek);
});
seek.addEventListener("input", () => {
  video.currentTime = Number(seek.value);
  setFill(seek);
});

// Volume + mute
function syncVolume() {
  volume.value = video.muted ? 0 : video.volume;
  setFill(volume);
  player.classList.toggle("is-muted", video.muted || video.volume === 0);
  muteBtn.setAttribute("aria-label", video.muted || video.volume === 0 ? "Unmute" : "Mute");
}
volume.addEventListener("input", () => {
  video.volume = Number(volume.value);
  video.muted = video.volume === 0;
});
muteBtn.addEventListener("click", () => {
  video.muted = !video.muted;
  if (!video.muted && video.volume === 0) video.volume = 0.5;
});
video.addEventListener("volumechange", syncVolume);
syncVolume();

// Fullscreen
fsBtn.addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else if (player.requestFullscreen) player.requestFullscreen();
  else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); // iPhone Safari
});

// Hide the controls after 2.5s of no mouse movement while playing.
let idleTimer;
function wake() {
  player.classList.remove("is-idle");
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!video.paused) player.classList.add("is-idle");
  }, 2500);
}
["mousemove", "touchstart", "keydown", "focusin"].forEach((ev) => player.addEventListener(ev, wake));

// Keyboard shortcuts (only when focus is not on a text field / slider)
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea, select")) return;
  if (e.target.closest("button, a") && (e.key === " " || e.key === "Enter")) return;
  switch (e.key.toLowerCase()) {
    case " ":
    case "k":
      e.preventDefault();
      togglePlay();
      break;
    case "m":
      video.muted = !video.muted;
      break;
    case "f":
      fsBtn.click();
      break;
    case "arrowleft":
      video.currentTime = Math.max(0, video.currentTime - 5);
      break;
    case "arrowright":
      video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 5);
      break;
  }
});
