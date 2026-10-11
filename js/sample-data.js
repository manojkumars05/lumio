// =============================================================================
// sample-data.js - demo content shown while your Firestore "videos" / "images"
// collections are empty, so the home page is never blank on first run.
//
// - Videos stream from Google's public sample bucket (Blender Foundation open
//   movies and short clips). Swap the URLs for your own files any time.
// - Thumbnails and photos are original SVG files in /assets.
// Once you upload real content (upload.html) the demo data disappears.
// =============================================================================

const BASE = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/";

export const SAMPLE_VIDEOS = [
  {
    id: "sample-1",
    title: "Big Buck Bunny",
    description: "A giant rabbit with a heart bigger than himself deals with three mischievous rodents in this open-source animated comedy.",
    videoUrl: BASE + "BigBuckBunny.mp4",
    thumbnailUrl: "assets/thumbnails/thumb-1.svg",
    duration: 596,
    tags: ["animation", "comedy", "open movie"],
    uploaderName: "Lumio Demo",
    createdAt: "2026-09-28T09:00:00Z",
  },
  {
    id: "sample-2",
    title: "Elephants Dream",
    description: "Two strange characters explore a surreal mechanical world in the first open-source 3D animated short.",
    videoUrl: BASE + "ElephantsDream.mp4",
    thumbnailUrl: "assets/thumbnails/thumb-2.svg",
    duration: 653,
    tags: ["animation", "surreal", "open movie"],
    uploaderName: "Lumio Demo",
    createdAt: "2026-09-30T12:30:00Z",
  },
  {
    id: "sample-3",
    title: "Sintel",
    description: "A lonely young woman searches the world for the baby dragon she once befriended. A fantasy adventure short.",
    videoUrl: BASE + "Sintel.mp4",
    thumbnailUrl: "assets/thumbnails/thumb-3.svg",
    duration: 888,
    tags: ["animation", "fantasy", "dragon"],
    uploaderName: "Lumio Demo",
    createdAt: "2026-10-02T16:15:00Z",
  },
  {
    id: "sample-4",
    title: "Tears of Steel",
    description: "A sci-fi short mixing live action with visual effects: a band of fighters tries to save the world from rogue robots.",
    videoUrl: BASE + "TearsOfSteel.mp4",
    thumbnailUrl: "assets/thumbnails/thumb-4.svg",
    duration: 734,
    tags: ["sci-fi", "visual effects", "robots"],
    uploaderName: "Lumio Demo",
    createdAt: "2026-10-05T08:45:00Z",
  },
  {
    id: "sample-5",
    title: "Bigger Blazes - Quick Clip",
    description: "A very short demo clip, handy for testing playback, seeking and volume controls without waiting for a long video.",
    videoUrl: BASE + "ForBiggerBlazes.mp4",
    thumbnailUrl: "assets/thumbnails/thumb-5.svg",
    duration: 15,
    tags: ["short", "demo", "test clip"],
    uploaderName: "Lumio Demo",
    createdAt: "2026-10-08T10:00:00Z",
  },
  {
    id: "sample-6",
    title: "Bigger Joyrides - Quick Clip",
    description: "Another 15-second sample clip for trying out the player. Use it to test fullscreen and the progress bar.",
    videoUrl: BASE + "ForBiggerJoyrides.mp4",
    thumbnailUrl: "assets/thumbnails/thumb-6.svg",
    duration: 15,
    tags: ["short", "demo", "test clip"],
    uploaderName: "Lumio Demo",
    createdAt: "2026-10-09T18:20:00Z",
  },
];

export const SAMPLE_IMAGES = [
  { id: "sample-img-1", title: "Aurora Ridge", imageUrl: "assets/images/photo-1.svg", uploaderName: "Lumio Demo", createdAt: "2026-09-20T09:00:00Z" },
  { id: "sample-img-2", title: "Neon Harbor", imageUrl: "assets/images/photo-2.svg", uploaderName: "Lumio Demo", createdAt: "2026-09-21T09:00:00Z" },
  { id: "sample-img-3", title: "Desert Bloom", imageUrl: "assets/images/photo-3.svg", uploaderName: "Lumio Demo", createdAt: "2026-09-22T09:00:00Z" },
  { id: "sample-img-4", title: "Midnight Garden", imageUrl: "assets/images/photo-4.svg", uploaderName: "Lumio Demo", createdAt: "2026-09-23T09:00:00Z" },
  { id: "sample-img-5", title: "Glass Canyon", imageUrl: "assets/images/photo-5.svg", uploaderName: "Lumio Demo", createdAt: "2026-09-24T09:00:00Z" },
  { id: "sample-img-6", title: "Ember Sky", imageUrl: "assets/images/photo-6.svg", uploaderName: "Lumio Demo", createdAt: "2026-09-25T09:00:00Z" },
];
