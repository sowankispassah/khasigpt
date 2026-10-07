import React from 'react';
import {AbsoluteFill, interpolate} from 'remotion';
import {C, clamp, expoOut, FONT, kf, tw} from '../theme';
import {Logo} from './Brand';

/**
 * Soft brand glow on white: overlapping radial gradients that drift.
 * Colours: emerald avatar, image-generation teal and sky, sidebar-ring blue.
 */
export const Aurora: React.FC<{
	f: number;
	x: number;
	y: number;
	w: number;
	h: number;
	opacity?: number;
	speed?: number;
}> = ({f, x, y, w, h, opacity = 1, speed = 1}) => {
	const blobs = [
		{c: 'rgba(16,185,129,0.55)', r: 0.55, a: 0, k: 1},
		{c: 'rgba(0,128,153,0.45)', r: 0.5, a: 2.1, k: -0.8},
		{c: 'rgba(59,130,246,0.40)', r: 0.5, a: 4.2, k: 1.2},
		{c: 'rgba(167,215,244,0.75)', r: 0.62, a: 1.1, k: -1.1},
	];
	return (
		<div style={{position: 'absolute', left: x - w / 2, top: y - h / 2, width: w, height: h, opacity, pointerEvents: 'none'}}>
			{blobs.map((b, i) => {
				const ang = b.a + (f / 60) * 0.9 * speed * b.k;
				const bx = 50 + Math.cos(ang) * 16;
				const by = 50 + Math.sin(ang * 1.3) * 14;
				return (
					<div
						key={i}
						style={{
							position: 'absolute',
							inset: 0,
							background: `radial-gradient(${b.r * 100}% ${b.r * 100}% at ${bx}% ${by}%, ${b.c} 0%, rgba(255,255,255,0) 70%)`,
						}}
					/>
				);
			})}
		</div>
	);
};

/** Dark pill with spinning white logo – the reference's "Checking online resources…" beat. */
export const StatusPill: React.FC<{f: number; text: string; scale?: number; glow?: number; dots?: boolean}> = ({f, text, scale = 1, glow = 1, dots = true}) => {
	const dotCount = (Math.floor(f / 14) % 3) + 1;
	return (
		<div style={{position: 'relative', display: 'inline-flex', transform: `scale(${scale})`}}>
			<div
				style={{
					position: 'absolute',
					inset: '-70px -90px',
					background:
						'radial-gradient(40% 55% at 30% 50%, rgba(16,185,129,0.55), rgba(255,255,255,0) 70%), radial-gradient(40% 60% at 70% 50%, rgba(59,130,246,0.45), rgba(255,255,255,0) 70%), radial-gradient(60% 60% at 50% 60%, rgba(0,128,153,0.35), rgba(255,255,255,0) 72%)',
					opacity: glow,
				}}
			/>
			<div
				style={{
					position: 'relative',
					display: 'flex',
					alignItems: 'center',
					gap: 26,
					padding: '30px 52px 30px 36px',
					borderRadius: 999,
					background: 'linear-gradient(180deg, #232327, #0c0c0e)',
					boxShadow: '0 22px 50px rgba(9,9,11,0.28), inset 0 1px 0 rgba(255,255,255,0.12)',
					color: '#fafafa',
					fontFamily: FONT,
					fontSize: 46,
					fontWeight: 500,
					letterSpacing: -0.5,
					whiteSpace: 'nowrap',
				}}
			>
				<div style={{width: 62, height: 62, borderRadius: 31, background: '#fff', display: 'grid', placeItems: 'center', rotate: `${f * 4}deg`}}>
					<Logo size={50} />
				</div>
				<span>
					{text}
					{dots ? <span style={{display: 'inline-block', width: 54, textAlign: 'left'}}>{'.'.repeat(dotCount)}</span> : null}
				</span>
			</div>
		</div>
	);
};

/** Finger-tap indicator for touch UIs. */
export const Tap: React.FC<{x: number; y: number; f: number; at: number; size?: number}> = ({x, y, f, at, size = 92}) => {
	const local = f - at;
	if (local < -22 || local > 30) return null;
	const appear = interpolate(local, [-22, -10], [0, 1], clamp);
	const press = kf(local, [-6, 0, 8], [1, 0.78, 1]);
	const out = interpolate(local, [10, 30], [1, 0], clamp);
	const ring = interpolate(local, [0, 26], [0.6, 2.4], {...clamp, easing: expoOut});
	return (
		<div style={{position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, pointerEvents: 'none', zIndex: 100}}>
			<div
				style={{
					position: 'absolute',
					inset: 0,
					borderRadius: '50%',
					background: 'rgba(9,9,11,0.20)',
					border: '4px solid rgba(255,255,255,0.95)',
					boxShadow: '0 8px 24px rgba(9,9,11,0.25)',
					opacity: appear * out,
					transform: `scale(${press})`,
				}}
			/>
			{local >= 0 ? (
				<div style={{position: 'absolute', inset: 0, borderRadius: '50%', border: '4px solid rgba(9,9,11,0.35)', transform: `scale(${ring})`, opacity: interpolate(local, [0, 26], [0.9, 0], clamp)}} />
			) : null}
		</div>
	);
};

/** Expanding thin ring used on hits. */
export const Shockwave: React.FC<{f: number; at: number; x: number; y: number; size: number; color?: string; width?: number; dur?: number}> = ({f, at, x, y, size, color = C.ink, width = 3, dur = 32}) => {
	const local = f - at;
	if (local < 0 || local > dur) return null;
	const s = tw(local, [0, dur], [0.4, 1.5]);
	return (
		<div
			style={{
				position: 'absolute',
				left: x - size / 2,
				top: y - size / 2,
				width: size,
				height: size,
				borderRadius: '50%',
				border: `${width}px solid ${color}`,
				transform: `scale(${s})`,
				opacity: interpolate(local, [0, 4, dur], [0, 0.5, 0], clamp),
			}}
		/>
	);
};

/** White bloom for hard cuts. */
export const Flash: React.FC<{f: number; at: number; dur?: number; peak?: number}> = ({f, at, dur = 14, peak = 1}) => {
	const o = interpolate(f, [at - dur * 0.4, at, at + dur], [0, peak, 0], clamp);
	if (o <= 0) return null;
	return <AbsoluteFill style={{background: '#fff', opacity: o, pointerEvents: 'none', zIndex: 500}} />;
};

/** Word that rises out of a mask. */
export const RiseWord: React.FC<{
	f: number;
	at: number;
	children: React.ReactNode;
	size: number;
	weight?: number;
	color?: string;
	dur?: number;
	exitAt?: number;
	style?: React.CSSProperties;
	tracking?: number;
}> = ({f, at, children, size, weight = 700, color = C.ink, dur = 22, exitAt, style, tracking}) => {
	const y = tw(f, [at, at + dur], [1.15, 0]);
	const exit = exitAt === undefined ? 0 : tw(f, [exitAt, exitAt + 16], [0, -1.15], (t) => t * t * t);
	return (
		<div style={{overflow: 'hidden', paddingBottom: size * 0.12, marginBottom: -size * 0.12, ...style}}>
			<div
				style={{
					fontFamily: FONT,
					fontSize: size,
					fontWeight: weight,
					letterSpacing: tracking ?? -size * 0.045,
					lineHeight: 1.04,
					color,
					transform: `translateY(${(y + exit) * 100}%)`,
					whiteSpace: 'nowrap',
				}}
			>
				{children}
			</div>
		</div>
	);
};

/** Blinking text caret. */
export const Caret: React.FC<{f: number; h: number; on?: boolean; color?: string}> = ({f, h, on = true, color = C.ink}) => (
	<span
		style={{
			display: 'inline-block',
			width: Math.max(2, h * 0.06),
			height: h,
			marginLeft: h * 0.06,
			verticalAlign: 'text-bottom',
			background: color,
			opacity: on || f % 60 < 34 ? 1 : 0,
		}}
	/>
);
