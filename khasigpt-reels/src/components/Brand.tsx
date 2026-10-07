import React from 'react';
import {Img, staticFile} from 'remotion';
import {C, clamp, FONT, GRADIENT} from '../theme';
import {interpolate} from 'remotion';

/** Static KhasiGPT logo (the real PNG). */
export const Logo: React.FC<{size: number; invert?: boolean; style?: React.CSSProperties}> = ({size, invert = false, style}) => (
	<Img
		src={staticFile('khasigptlogo.png')}
		style={{width: size, height: size * (876 / 868), objectFit: 'contain', filter: invert ? 'invert(1)' : undefined, ...style}}
	/>
);

export type LogoBuildState = {
	/** 0 → 1 ring draw */
	ring: number;
	/** 0 → 1 shield scale */
	shield: number;
	/** 0 → 1 spear "\" slide-in */
	spearA: number;
	/** 0 → 1 spear "/" slide-in */
	spearB: number;
	/** rotation of the ring draw start */
	spin?: number;
};

const layer = (file: string, style: React.CSSProperties) => (
	<Img src={staticFile(file)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', ...style}} />
);

/**
 * The real logo split into ring, shield and two spears (public/logo-*.png)
 * so it can be assembled on screen.
 */
export const LogoBuild: React.FC<{size: number; state: LogoBuildState; style?: React.CSSProperties}> = ({size, state, style}) => {
	const {ring, shield, spearA, spearB, spin = 0} = state;
	const travel = size * 0.9;
	const ringDeg = Math.max(0, Math.min(1, ring)) * 360;
	const mask = ring >= 1 ? undefined : `conic-gradient(from ${-90 + spin}deg at 50% 50%, #000 0deg, #000 ${ringDeg}deg, transparent ${ringDeg + 0.5}deg)`;
	return (
		<div style={{position: 'relative', width: size, height: size * (876 / 868), ...style}}>
			{layer('logo-shield.png', {
				transform: `scale(${shield}) rotate(${(1 - shield) * -40}deg)`,
				opacity: Math.min(1, shield * 3),
			})}
			{layer('logo-spear-a.png', {
				transform: `translate(${-(1 - spearA) * travel}px, ${-(1 - spearA) * travel * 1.05}px)`,
				opacity: interpolate(spearA, [0, 0.25], [0, 1], clamp),
			})}
			{layer('logo-spear-b.png', {
				transform: `translate(${(1 - spearB) * travel}px, ${-(1 - spearB) * travel * 1.05}px)`,
				opacity: interpolate(spearB, [0, 0.25], [0, 1], clamp),
			})}
			{layer('logo-ring.png', {
				WebkitMaskImage: mask,
				maskImage: mask,
				opacity: ring > 0 ? 1 : 0,
			})}
		</div>
	);
};

export const GradientText: React.FC<{children: React.ReactNode; style?: React.CSSProperties; shift?: number}> = ({children, style, shift = 0}) => (
	<span
		style={{
			backgroundImage: GRADIENT,
			backgroundSize: '200% 100%',
			backgroundPosition: `${shift}% 0`,
			WebkitBackgroundClip: 'text',
			backgroundClip: 'text',
			color: 'transparent',
			WebkitTextFillColor: 'transparent',
			...style,
		}}
	>
		{children}
	</span>
);

export const Wordmark: React.FC<{size: number; style?: React.CSSProperties}> = ({size, style}) => (
	<div style={{fontFamily: FONT, fontWeight: 700, fontSize: size, letterSpacing: -size * 0.045, color: C.ink, lineHeight: 1, ...style}}>KhasiGPT</div>
);
