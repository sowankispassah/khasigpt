/*
 * Timings for the enhanced cut of "KhasiGPT Promo Video Final.mp4" (21.03 s).
 * All values are seconds on the original video's clock; its music is kept as-is,
 * so every event below is pinned to that track (≈92 BPM, drop at 5.43 s).
 */
export const ENH = {
	duration: 21.0333,
	// music
	logoLock: 0.87,
	titleHit: 2.17,
	tagHit: 3.47,
	drop: 5.43,
	// recording (public/source/promo-final.mp4). Until the freeze the clip runs
	// LEAD seconds ahead so the UI is fully faded in on the drop.
	lead: 0.4,
	chipTap: 7.2,
	khasiTap: 8.4,
	modalOpen: 8.43,
	freezeSource: 9.2667, // last source frame where the dialog still reads "change to Khasi?"
	freezeAt: 8.8667,
	yesTap: 10.2, // from here the clip plays in sync with the original again
	spinner: 10.23,
	khasiHome: 11.25,
	pullBack: 12.6,
	demoEnd: 13.72,
	// end card
	endLock: 14.23,
	lockupUp: 15.21,
	download: 15.86,
	play: 16.52,
	bio: 17.17,
	orVisit: 17.82,
	urlPill: 18.15,
	urlType: 18.3,
	urlTap: 19.12,
};

/** The recording's app viewport (source pixels) and where the card sits on the canvas. */
export const VIEW = {x: 42, y: 770, w: 990, h: 380};
export const CARD = {x: 45, y: 750};
/** Source pixel → canvas pixel. */
export const toCanvas = (sx: number, sy: number) => ({x: sx - VIEW.x + CARD.x, y: sy - VIEW.y + CARD.y});
