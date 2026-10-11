/** Scene lengths at 60 fps. Every cut lands on a bar line of the 120 BPM score. */
export const SCENES = {
	hook: 180, // 0–3 s
	chat: 480, // 3–11 s
	voice: 360, // 11–17 s
	image: 480, // 17–25 s
	explore: 360, // 25–31 s
	montage: 360, // 31–37 s
	finale: 480, // 37–45 s
} as const;

export const TOTAL = Object.values(SCENES).reduce((a, b) => a + b, 0); // 2700 = 45 s
