import React from 'react';
import {interpolate} from 'remotion';
import {Composer} from './AppUI';
import {Aurora} from './Fx';
import {C, clamp, expoOut, tw} from '../theme';

export const HERO_K = 2.42;
export const HERO_W = 388 * HERO_K;
export const HERO_H = 124 * HERO_K;

/**
 * The glowing pill from the reference that grows into KhasiGPT's real composer card.
 * `at` is the frame the pill starts growing from a dot.
 */
export const HeroComposer: React.FC<{
	f: number;
	at: number;
	cy: number;
	text: string;
	placeholder: string;
	caret: boolean;
	imageMode?: boolean;
	imagePress?: number;
	sendPress?: number;
	/** 0..1 flight towards target */
	flight?: number;
	target?: {x: number; y: number; scale: number};
	opacity?: number;
	glow?: number;
}> = ({f, at, cy, text, placeholder, caret, imageMode = false, imagePress = 1, sendPress = 1, flight = 0, target, opacity = 1, glow = 1}) => {
	const l = f - at;
	const w = interpolate(l, [0, 22], [44, HERO_W], {...clamp, easing: expoOut});
	const h = l < 20 ? interpolate(l, [0, 22], [44, 150], {...clamp, easing: expoOut}) : interpolate(l, [20, 42], [150, HERO_H], {...clamp, easing: expoOut});
	const r = interpolate(l, [20, 42], [h / 2, 18 * HERO_K], clamp);
	const content = interpolate(l, [30, 44], [0, 1], clamp);
	const tx = target ? (target.x - 540) * flight : 0;
	const ty = target ? (target.y - cy) * flight : 0;
	const sc = target ? 1 + (target.scale - 1) * flight : 1;
	return (
		<>
			<Aurora f={f} x={540 + tx} y={cy + ty} w={1400 * sc} h={900 * sc} opacity={glow * interpolate(l, [0, 18], [0, 1], clamp) * (1 - flight)} speed={1.2} />
			<div
				style={{
					position: 'absolute',
					left: 540 - w / 2,
					top: cy - h / 2,
					width: w,
					height: h,
					borderRadius: r,
					background: '#fff',
					border: `2px solid ${C.border}`,
					boxShadow: `0 ${30 * (1 - flight * 0.6)}px ${80 * (1 - flight * 0.5)}px rgba(9,9,11,0.13), 0 2px 6px rgba(9,9,11,0.06)`,
					overflow: 'hidden',
					transform: `translate(${tx}px, ${ty}px) scale(${sc})`,
					opacity,
				}}
			>
				<div style={{opacity: content, transform: `translateY(${tw(l, [30, 46], [18, 0])}px)`}}>
					<Composer
						k={HERO_K}
						text={text}
						placeholder={placeholder}
						caretF={caret ? f : null}
						sendActive={text.length > 0}
						sendPress={sendPress}
						imageMode={imageMode}
						imagePress={imagePress}
						style={{border: 'none', boxShadow: 'none', background: 'transparent'}}
					/>
				</div>
			</div>
		</>
	);
};
