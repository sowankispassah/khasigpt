# KhasiGPT — Instagram Reel

A standalone vertical promo built natively for Instagram Reels and YouTube Shorts. It runs at 1080 × 1920, 60 fps, for 45 s, and renders to H.264 MP4 with AAC audio. The canvas is pure white throughout. It follows the reference's motion language: a glowing composer pill, a status pill with a spinning logo, 3D phones, a typed tagline pill, and a logo end card.

## Preview and export

```sh
npm install
npm run dev        # Studio on http://localhost:3003/KhasiGPTReel
npm run render     # out/KhasiGPT-instagram-reel.mp4
npm run lint       # eslint + tsc
```

Each scene is also registered on its own under **Scenes** in Studio. Scene timing lives in `src/timeline.ts`. All copy lives in `src/content.ts`.

## Timeline

Every cut lands on a bar line of the 120 BPM score.

| Time | Scene | File |
| --- | --- | --- |
| 0–3 s | The real logo assembles (ring, shield, spears) → wordmark → "The AI that speaks Khasi." | `S1Hook.tsx` |
| 3–11 s | Glowing pill → composer → Khasi question → phone rises → "Dang pyrkhat…" → streamed Khasi answer | `S2Chat.tsx` |
| 11–17 s | Voice chat modal lifts out of the phone, with waveform ribbons and a live Khasi transcript | `S3Voice.tsx` |
| 17–25 s | "Generate image" mode → prompt → progress wash → image bursts out of the phone (21 s drop) | `S4Image.tsx` |
| 25–31 s | Explore Meghalaya ("Nearby") cards fly out → drawer → feature chips | `S5Explore.tsx` |
| 31–37 s | A tilted wall of real app screens with the typed tagline "Your language. Your AI." | `S6Montage.tsx` |
| 37–45 s | Logo build, wordmark, tagline, khasigpt.com pill, Google Play | `S7Finale.tsx` |

Copy is kept inside the Reels safe area: below the top 250 px, above the bottom 420 px, and clear of the right-hand action column.

## App fidelity

- **Fonts:** Geist, the app's own font (`public/fonts`, taken from `@expo-google-fonts/geist`, SIL OFL).
- **Colours:** the zinc tokens from `app/globals.css` and `native/src/theme/tokens.ts`.
- **Accents:** the gradient uses only colours that already exist in the app: the emerald avatar, the image-generation teal and sky, and the sidebar-ring blue.
- **Screens:** recreated from the native Android app, at the same dp sizes and with the same Lucide icons. Sources are `native/src/screens/ChatScreen.tsx`, `PageHeader`, `AppSidebar`, the voice modal, the image-generation progress frame, and the Nearby screen.
- **Khasi strings:** reused from the app's i18n fallbacks and from the chat transcripts supplied for the earlier promos. Change them in `src/content.ts`.
- **Logo:** `public/logo-*.png` are pixel-exact layers split from `public/images/khasigptlogo.png`, so the real logo can be assembled on screen.

## Audio

| Script | Output |
| --- | --- |
| `python scripts/make_music.py` | `public/reel-music.wav`: an original 120 BPM score, synthesised with NumPy/SciPy |
| `python scripts/make_soundtrack.py` | `public/reel-soundtrack.wav`: the score plus 171 frame-accurate sound effects (typing, taps, whooshes, the logo clang, chimes, sparkles) |

The Reel plays only `reel-soundtrack.wav`.

- **Rebuild:** run both scripts after changing scene timing, and keep the cue sheet in `make_soundtrack.py` in step with the scenes.
- **Sources:** no third-party music. `public/click.wav` is the Remotion SFX-library tap, the same one used by `khasigpt-motion-white`.

## Image credits

The Explore Meghalaya cards use public-domain / CC0 photos from Wikimedia Commons; details are in `public/places/credits.json`. No attribution is required, but a credit line is good practice:

- Nohkalikai Falls: "Nohkalikai falls, shillong, meghalaya" (public domain)
- Umngot River, Dawki: "The clear water of Dawki (Unsplash)" (CC0)
- Double Decker Living Root Bridge: "Double Decker Root Bridge, Nongriat" (CC0)
- Ward's Lake: "Ward's Lake, Shillong India" (CC0)
- Laitlum: "High angle view of terrace farming near Laitlum" (CC0)
- Shillong Peak: "A birds eye view of Shillong from Shillong Peak" (CC0)

The "generated" sunset over Umiam Lake is a procedural illustration (`src/components/Painting.tsx`). It is not output from KhasiGPT's image model.
