# InfiniX update: Home page (bell, friends, suggestions)

Publish steps
1. Firebase console -> Firestore Database -> Rules -> paste firestore.rules -> Publish.
2. Upload this folder to GitHub Pages. Open the app twice (the first visit installs the new cache).
3. Open Home once on each account: this publishes the user's card to `directory`, so people appear in each other's suggestions.

Changed / new
- home.html, js/home.js, css/style.css: bell icon with unread badge + notifications list, "Your friends", "People you may know"
- js/sidebar.js: saves unread chats for the bell from the listener it already has (no new reads)
- firestore.rules: new `directory/{uid}` and `users/{uid}/notifications/{id}`
- sw.js: cache v3

Reads: friends and message alerts cost 0 reads. Follower notices: max 1 query per 2 minutes. Suggestions: max 40 docs per 6 hours.
Note: "new follower" notices appear once the Follow button (next item) writes them.

## Follow system
- js/follow.js (new): follow / unfollow, lists and counts, cached 5 min
- search.js: Follow / Following + Message buttons
- friends.html, js/friends.js: Followers / Following counts, Friends / Followers / Following tabs
- home.js: Follow button in suggestions, followed people in "Your friends"
- firestore.rules: `follows/{followerUid}_{followeeUid}`; follower can re-send the bell notice after unfollow
- sw.js: cache v4. Publish the rules first, then upload.

## Profile photo
- settings.html, js/settings.js: photo with edit icon; picked image is cropped square, compressed to 256 px JPEG and saved at once (users + handles)
- js/auth.js, js/boot.js: photo shown on every page header (cached, so no flicker); search shows photos too
- firestore.rules: `photo` allowed on users/{uid} and handles/{id} (JPEG data URL, max 40 KB)
- sw.js: cache v5

## Vercel function
- infinix-vercel-function.zip (separate download): /api/reset-password for the forgot password flow. See its README.md. Then set RESET_API_URL in js/reset-config.js.
