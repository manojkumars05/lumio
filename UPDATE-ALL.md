# InfiniX update (items 1 to 5) - upload everything in this zip, keep the same folders

No Firebase rules change is needed. Open the app twice after uploading (sw.js = v7).

1. Follower count: js/follow.js, js/friends.js (+1 right away when someone follows you, then exact count)
2. Download option now in the main Settings list: settings.html
3. Profile photos for everyone: js/avatars.js (new), js/chat.js, js/friends.js, js/home.js
4. Screenshots and tall photos
   - js/photo.js: long screenshots are decoded at a small size (no more blank white picture), transparent
     PNGs are flattened on the dark app colour, and a blank result is retried a second way.
   - js/chat.js + chat.html: the chat preview is at most 300 x 380 (tall screenshots show their top part,
     max height 320 px in the bubble). Tap the photo to see the complete picture.
5. Invite friends
   - invite.html (new): public landing page (works without login).
   - settings.html + js/settings.js: "Invite friends" in Settings, shown in the installed app and on
     computers only (hidden in a phone's browser). Share sheet (navigator.share) with copy / WhatsApp /
     Telegram / email as backup.
