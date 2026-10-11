import {Easing, interpolate, spring} from 'remotion';

export const FPS = 60;
export const WIDTH = 1080;
export const HEIGHT = 1920;

/** Seconds → frames at 60 fps. */
export const sec = (s: number) => Math.round(s * FPS);

/** KhasiGPT light-mode tokens (app/globals.css, native/src/theme/tokens.ts). */
export const C = {
	bg: '#ffffff',
	ink: '#09090b',
	primary: '#18181b',
	muted: '#f4f4f5',
	mutedFg: '#71717a',
	border: '#e4e4e7',
	sidebar: '#fafafa',
	sidebarFg: '#3f3f46',
	history: '#9ca3af',
	emerald: '#10b981',
	teal: '#008099',
	sky: '#a7d7f4',
	blue: '#3b82f6',
};

/** Brand accent built only from colours that already exist in the app. */
export const GRADIENT = `linear-gradient(100deg, #059669 0%, ${C.emerald} 30%, ${C.teal} 64%, ${C.blue} 100%)`;

export const FONT = 'Geist, "Segoe UI", Arial, sans-serif';

export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
export const expoOut = Easing.bezier(0.16, 1, 0.3, 1);
export const quintOut = Easing.bezier(0.22, 1, 0.36, 1);
export const inOut = Easing.bezier(0.65, 0, 0.35, 1);
export const expoIn = Easing.bezier(0.7, 0, 0.84, 0);

/** Clamped interpolate with expo-out easing by default. */
export const tw = (
	f: number,
	input: [number, number],
	output: [number, number],
	easing: (t: number) => number = expoOut,
) => interpolate(f, input, output, {...clamp, easing});

/** Clamped multi-keyframe interpolate. */
export const kf = (f: number, input: number[], output: number[], easing: (t: number) => number = inOut) =>
	interpolate(f, input, output, {...clamp, easing});

/** Snappy spring at 60 fps. */
export const pop = (f: number, delay = 0, damping = 14, stiffness = 170, mass = 0.8) =>
	spring({frame: f - delay, fps: FPS, config: {damping, stiffness, mass}});

/** Overdamped push with no bounce. */
export const glide = (f: number, delay = 0, durationInFrames = 30) =>
	spring({frame: f - delay, fps: FPS, durationInFrames, config: {damping: 200}});

/** Native app density: screen is 412 dp wide, rendered at 860 px. */
export const SCREEN_W = 860;
export const SCREEN_H = 1910;
export const DP = SCREEN_W / 412;
export const dp = (v: number) => v * DP;

/** Instagram Reels safe area (keep copy inside). */
export const SAFE = {top: 250, bottom: 1500, left: 72, right: 1008, rightLower: 930};

/** Deterministic pseudo-random. */
export const rand = (seed: number) => {
	const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
	return x - Math.floor(x);
};

/** Characters visible for a typing animation. */
export const typed = (text: string, f: number, start: number, framesPerChar: number) =>
	text.slice(0, Math.max(0, Math.min(text.length, Math.floor((f - start) / framesPerChar))));
