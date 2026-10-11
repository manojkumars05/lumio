# Lumio - a 100% free video-sharing website

Lumio is a modern, responsive video-sharing site built with plain **HTML, CSS and JavaScript** and **Firebase** (Authentication + Firestore). It is designed to run at **zero cost, with no credit card**:

| Part | Free service |
|---|---|
| Website hosting | GitHub Pages (or Firebase Hosting) |
| Login / accounts | Firebase Authentication (free Spark plan) |
| Database | Firebase Firestore (free Spark plan) |
| Video & image files | Any free host that gives a direct link (Cloudinary, Internet Archive, GitHub...) - Lumio saves only the link |

> Firebase Storage is **not used**, because new projects may need a paid plan for it. Limits and policies of free plans change, so check each service's pricing page.

## Features

- Registration (full name, email, password, confirm password) with validation
- Login, logout, persistent sessions
- Profile saved in Firestore (`users/{uid}`); passwords are handled only by Firebase Authentication
- Home page: header, navigation, profile card, search, video feed, photo gallery
- Video cards: thumbnail, title, description, upload date, duration
- Watch page with custom player: play/pause, progress bar, volume/mute, fullscreen, keyboard shortcuts; no autoplay
- Live search by title, description, tags, uploader
- Admin page to add videos/photos by link (links are checked before saving)
- Demo data so the home page isn't empty on first run
- Loading skeletons, empty states, error messages, accessible forms, light/dark theme
- Mobile, tablet and desktop layouts

## Folder structure

```
/
├── index.html          Entry: routes to register.html or home.html
├── register.html       Create an account (first screen for new visitors)
├── login.html          Log in
├── home.html           Feed, search, photos, profile
├── watch.html          Player page (watch.html?id=VIDEO_ID)
├── upload.html         Admin page: add videos/photos by link
├── css/style.css       All styles
├── js/
│   ├── firebase-config.js   YOUR Firebase web config goes here
│   ├── auth.js              Auth helpers (guard, logout, errors)
│   ├── register.js / login.js
│   ├── home.js / watch.js / upload.js
│   ├── data.js              Firestore reads
│   ├── sample-data.js       Demo videos/photos
│   └── utils.js             Shared helpers
├── assets/
│   ├── images/              Logo + demo photos
│   └── thumbnails/          Demo thumbnails + placeholder
├── firestore.rules     Firestore Security Rules
├── firebase.json       Optional: Firebase Hosting / rules config
├── .gitignore
└── README.md
```

## Setup (all free)

### 1. Create a Firebase project
<https://console.firebase.google.com> -> **Add project** -> name it -> finish (Analytics optional). Stay on the free **Spark** plan.

### 2. Enable Email/Password sign-in
**Build -> Authentication -> Get started -> Sign-in method -> Email/Password -> Enable -> Save.**

### 3. Create Firestore
**Build -> Firestore Database -> Create database** -> pick a location -> **production mode**.

### 4. Add your web config
**Project settings (gear) -> General -> Your apps -> Web (`</>`) -> Register app**, then copy the `firebaseConfig` values into **`js/firebase-config.js`** (you can ignore `storageBucket`).

### 5. Publish the Firestore rules
Firestore Database -> **Rules** tab -> paste all of `firestore.rules` -> **Publish**.

### 6. Make yourself an admin
Anyone can register and watch. Only admins can add content.
1. Register on the site and open `upload.html` - it shows your **user ID**.
2. Firebase console -> Firestore -> **Start collection** `admins`.
3. Add a document whose **Document ID** is your user ID (any field, e.g. `role` = `admin`).
4. Reload `upload.html`.

## Hosting your video and image files for free

Lumio's player needs a **direct file link** (ends in `.mp4` / `.webm` for video, `.jpg` / `.png` / `.webp` for images, and starts with `https://`).

- **Cloudinary** - free plan, sign-up without a card. Upload, then copy the delivery URL.
- **Internet Archive (archive.org)** - upload a file and use its direct download link.
- **GitHub repo / GitHub Pages** - for small clips (single files must be under 100 MB; keep the repo small). Example: `https://YOUR-NAME.github.io/lumio/media/clip.mp4`.

Tips: compress videos first (HandBrake, 720p H.264), keep thumbnails under 200 KB. A normal YouTube *watch page* link will not play in this player.

## Which Firebase values are safe in frontend code?

| Value | Safe to expose? |
|---|---|
| `apiKey`, `authDomain`, `projectId`, `messagingSenderId`, `appId` | **Yes.** They identify your project. Security comes from Auth + Security Rules. |
| Service-account JSON / private key | **Never.** Full admin access. |
| Admin SDK credentials, CI tokens | **Never.** |
| Passwords | Never stored by you; Firebase Authentication handles them. |

Extra hardening: restrict the browser API key to your domains (Google Cloud Console -> APIs & Services -> Credentials) and keep **Authentication -> Settings -> Authorized domains** to only the domains you use.

## Run locally
ES modules need a web server:
```bash
python3 -m http.server 8000     # or: npx serve .
```
Open <http://localhost:8000> (`localhost` is authorized by default).

## Upload to GitHub
Create an empty repo named `lumio` on GitHub, then:
```bash
git init
git add .
git commit -m "Initial commit: Lumio video platform"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/lumio.git
git push -u origin main
```

## Deploy

### Option A - GitHub Pages (free)
1. Repo -> **Settings -> Pages** -> Deploy from a branch -> `main` / `(root)` -> Save.
2. Site: `https://YOUR-USERNAME.github.io/lumio/`
3. Firebase -> **Authentication -> Settings -> Authorized domains -> Add domain** -> `YOUR-USERNAME.github.io` (login fails without this).

### Option B - Firebase Hosting (free Spark plan)
```bash
npm install -g firebase-tools
firebase login
firebase init hosting      # public directory: .   single-page app: No   don't overwrite files
firebase deploy
```

## Demo content
While `videos` / `images` are empty, Lumio shows demo items from `js/sample-data.js` (videos stream from Google's public sample-video bucket; thumbnails/photos are local SVGs). Real content replaces them automatically.

## Testing checklist
- [ ] Register with bad email / short password / mismatched passwords: inline errors
- [ ] Register OK: redirected to Home; user appears in Authentication; `users/{uid}` has no password
- [ ] Refresh Home: still logged in
- [ ] Log out: goes to Login; opening `home.html` directly redirects to Login
- [ ] Wrong password: friendly error; correct password: Home
- [ ] Home shows profile card, search, demo videos, photo gallery
- [ ] Search "animation", "short", a nonsense word (empty state), then clear
- [ ] Open a video: no autoplay; play/pause, seek, volume, mute, fullscreen work
- [ ] Resize to phone / tablet / desktop widths
- [ ] Non-admin sees "admins only" on `upload.html`
- [ ] After adding yourself to `admins`: add a photo link, then a video link; both appear on Home
- [ ] A non-https or broken link shows an error and is not saved
