import React from 'react';
import {BatteryFull, Signal, Wifi} from 'lucide-react';
import {C, dp, FONT, SCREEN_H, SCREEN_W} from '../theme';
import {ui} from '../content';

const BEZEL = 22;
export const BODY_W = SCREEN_W + BEZEL * 2;
export const BODY_H = SCREEN_H + BEZEL * 2;
const RADIUS = 132;
const SCREEN_RADIUS = RADIUS - BEZEL + 4;
const DEPTH = 96;
const LAYERS = 24;

export type PhoneProps = {
	/** Centre of the phone on the 1080 × 1920 canvas. */
	x: number;
	y: number;
	scale: number;
	rx?: number;
	ry?: number;
	rz?: number;
	/** Extra z translation in canvas pixels (towards camera is positive). */
	z?: number;
	perspective?: number;
	shadow?: number;
	opacity?: number;
	children?: React.ReactNode;
	/** Hide the status bar for full-bleed overlays. */
	statusBar?: boolean;
	screenBg?: string;
	style?: React.CSSProperties;
	/** Number of edge slabs; fewer for background phones. */
	layers?: number;
};

export const StatusBar: React.FC<{dark?: boolean}> = ({dark = false}) => {
	const color = dark ? '#fff' : C.ink;
	return (
		<div
			style={{
				position: 'absolute',
				left: 0,
				right: 0,
				top: 0,
				height: dp(34),
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				padding: `0 ${dp(24)}px`,
				color,
				fontFamily: FONT,
				fontSize: dp(14),
				fontWeight: 600,
				zIndex: 20,
			}}
		>
			<span>{ui.time}</span>
			<span style={{display: 'flex', gap: dp(5), alignItems: 'center'}}>
				<Signal size={dp(15)} strokeWidth={2.4} />
				<Wifi size={dp(15)} strokeWidth={2.4} />
				<BatteryFull size={dp(19)} strokeWidth={2} />
			</span>
		</div>
	);
};

/**
 * A 3D Android phone built from stacked layers so the metal edge shows when it turns.
 * Screen content is laid out at 860 × 1910 px (412 dp × 2.087).
 */
export const Phone: React.FC<PhoneProps> = ({
	x,
	y,
	scale,
	rx = 0,
	ry = 0,
	rz = 0,
	z = 0,
	perspective = 2600,
	shadow = 1,
	opacity = 1,
	children,
	statusBar = true,
	screenBg = '#fff',
	style,
	layers = LAYERS,
}) => {
	const turn = Math.abs((((ry % 360) + 540) % 360) - 180); // 0 = facing camera
	const facing = turn < 90;
	const glareShift = ry * 2.2 + rx * 1.2;
	const lift = 1 + z / 2600;
	return (
		<div style={{position: 'absolute', inset: 0, perspective, perspectiveOrigin: `${x}px ${y}px`, opacity, pointerEvents: 'none', ...style}}>
			{/* soft floor shadow, stays in screen space */}
			{shadow > 0 ? (
				<div
					style={{
						position: 'absolute',
						left: x - BODY_W * scale * 0.62 + ry * 2.5 * scale,
						top: y + BODY_H * scale * 0.36 - rx * 2 * scale,
						width: BODY_W * scale * 1.24,
						height: BODY_H * scale * 0.34,
						background: 'radial-gradient(closest-side, rgba(15,23,42,0.30), rgba(15,23,42,0.10) 55%, rgba(15,23,42,0) 100%)',
						opacity: shadow * Math.min(1, 0.55 + 0.45 / lift),
						transform: `scale(${scale > 0 ? 1 : 0})`,
					}}
				/>
			) : null}
			<div
				style={{
					position: 'absolute',
					left: x - BODY_W / 2,
					top: y - BODY_H / 2,
					width: BODY_W,
					height: BODY_H,
					transformStyle: 'preserve-3d',
					transform: `translateZ(${z}px) rotateZ(${rz}deg) rotateX(${rx}deg) rotateY(${ry}deg) scale(${scale})`,
				}}
			>
				{/* metal edge: stacked slabs */}
				{new Array(layers).fill(0).map((_, i) => {
					const t = i / Math.max(1, layers - 1);
					const light = 0.5 - Math.abs(t - 0.5);
					const c = Math.round(34 + light * 70);
					return (
						<div
							key={i}
							style={{
								position: 'absolute',
								inset: 0,
								borderRadius: RADIUS,
								background: `linear-gradient(90deg, rgb(${c + 30},${c + 31},${c + 35}), rgb(${c},${c + 1},${c + 4}) 12%, rgb(${c + 14},${c + 15},${c + 18}) 50%, rgb(${c},${c + 1},${c + 4}) 88%, rgb(${c + 30},${c + 31},${c + 35}))`,
								transform: `translateZ(${-1 - i * (DEPTH / Math.max(1, layers))}px)`,
							}}
						/>
					);
				})}
				{/* back glass */}
				<div
					style={{
						position: 'absolute',
						inset: 0,
						borderRadius: RADIUS,
						background: 'linear-gradient(160deg, #2b2d31, #121316 60%, #1d1e22)',
						transform: `translateZ(${-DEPTH - 1}px) rotateY(180deg)`,
						backfaceVisibility: 'hidden',
					}}
				>
					<div style={{position: 'absolute', left: 70, right: 70, top: 120, height: 210, borderRadius: 105, background: 'linear-gradient(180deg,#0b0b0d,#1f2024)', boxShadow: 'inset 0 0 0 3px #3a3b40'}}>
						{[0, 1, 2].map((i) => (
							<div key={i} style={{position: 'absolute', top: 45, left: 90 + i * 170, width: 120, height: 120, borderRadius: 60, background: 'radial-gradient(circle at 40% 35%, #3a4660, #07080b 55%)', boxShadow: '0 0 0 8px #18191c'}} />
						))}
					</div>
				</div>
				{/* front: bezel + screen */}
				<div
					style={{
						position: 'absolute',
						inset: 0,
						borderRadius: RADIUS,
						background: '#050506',
						boxShadow: 'inset 0 0 0 3px #3b3d42, inset 0 0 0 6px #0b0b0c',
						backfaceVisibility: 'hidden',
						visibility: facing ? 'visible' : 'hidden',
					}}
				>
					<div
						style={{
							position: 'absolute',
							left: BEZEL,
							top: BEZEL,
							width: SCREEN_W,
							height: SCREEN_H,
							borderRadius: SCREEN_RADIUS,
							overflow: 'hidden',
							background: screenBg,
							fontFamily: FONT,
							color: C.ink,
						}}
					>
						{children}
						{statusBar ? <StatusBar /> : null}
						{/* punch-hole camera */}
						<div style={{position: 'absolute', left: SCREEN_W / 2 - 17, top: 20, width: 34, height: 34, borderRadius: 17, background: 'radial-gradient(circle at 40% 38%, #2a3348, #020203 60%)', zIndex: 30}} />
						{/* glass glare */}
						<div
							style={{
								position: 'absolute',
								inset: -200,
								background: `linear-gradient(115deg, rgba(255,255,255,0) ${38 + glareShift * 0.15}%, rgba(255,255,255,0.16) ${46 + glareShift * 0.15}%, rgba(255,255,255,0) ${56 + glareShift * 0.15}%)`,
								mixBlendMode: 'screen',
								zIndex: 40,
							}}
						/>
					</div>
				</div>
			</div>
		</div>
	);
};
