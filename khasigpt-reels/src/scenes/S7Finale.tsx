import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {ArrowUp} from 'lucide-react';
import {GradientText, LogoBuild} from '../components/Brand';
import {Aurora, Caret, Flash, RiseWord, Shockwave, Tap} from '../components/Fx';
import {copy} from '../content';
import {C, clamp, expoOut, FONT, kf, pop, tw} from '../theme';

const LOGO_Y = 600;
const URL_AT = 150;
const URL_FPC = 4;
const TAP_AT = URL_AT + copy.url.length * URL_FPC + 14; // ~212

/** 37–45 s · Final logo build, wordmark, tagline and khasigpt.com call to action. */
export const S7Finale: React.FC = () => {
	const f = useCurrentFrame();
	const ring = tw(f, [0, 24], [0.25, 1]);
	const spearA = tw(f, [0, 20], [0.2, 1]);
	const spearB = tw(f, [3, 23], [0.15, 1]);
	const shield = pop(f, 6, 11, 190, 0.7);
	const punch = kf(f, [0, 22, 27, 46], [1.5, 1, 1.06, 1], expoOut);
	const float = Math.sin(f / 45) * 6;

	const url = copy.url.slice(0, Math.max(0, Math.min(copy.url.length, Math.floor((f - URL_AT) / URL_FPC))));
	const pillIn = pop(f, URL_AT - 24, 15, 150);
	const pillW = interpolate(f, [URL_AT - 24, URL_AT + 2], [130, 800], {...clamp, easing: expoOut});
	const press = kf(f, [TAP_AT - 4, TAP_AT, TAP_AT + 10], [1, 0.84, 1]);
	const sent = f >= TAP_AT;

	return (
		<AbsoluteFill style={{background: C.bg, fontFamily: FONT, overflow: 'hidden'}}>
			<Aurora f={f} x={540} y={LOGO_Y + 120} w={interpolate(f, [0, 30], [1900, 1500], clamp)} h={interpolate(f, [0, 30], [1900, 1500], clamp)} opacity={interpolate(f, [0, 30, 120], [1, 0.95, 0.7], clamp)} speed={1.1} />
			<div style={{position: 'absolute', left: 540 - 140, top: LOGO_Y - 141 + float, transform: `scale(${punch}) rotate(${interpolate(f, [0, 26], [-30, 0], {...clamp, easing: expoOut})}deg)`}}>
				<LogoBuild size={280} state={{ring, shield, spearA, spearB, spin: interpolate(f, [0, 24], [-60, 0], clamp)}} />
			</div>
			<Shockwave f={f} at={22} x={540} y={LOGO_Y} size={420} width={5} dur={28} />
			<Shockwave f={f} at={26} x={540} y={LOGO_Y} size={620} width={3} color={C.emerald} dur={32} />

			<div style={{position: 'absolute', left: 0, right: 0, top: 800, display: 'flex', justifyContent: 'center'}}>
				{'KhasiGPT'.split('').map((ch, i) => (
					<RiseWord key={i} f={f} at={34 + i * 2.4} size={156} weight={700} dur={22} tracking={-6}>
						{ch}
					</RiseWord>
				))}
			</div>
			<div style={{position: 'absolute', left: 0, right: 0, top: 990, textAlign: 'center', fontSize: 52, fontWeight: 600, letterSpacing: -1.2, color: C.ink, opacity: interpolate(f, [70, 86], [0, 1], clamp), transform: `translateY(${tw(f, [70, 92], [26, 0])}px)`}}>
				The AI that speaks <GradientText shift={interpolate(f, [70, 480], [0, 100], clamp)}>Khasi.</GradientText>
			</div>

			{/* call to action */}
			<div style={{position: 'absolute', left: 0, right: 0, top: 1102, textAlign: 'center', fontSize: 38, fontWeight: 500, color: C.mutedFg, opacity: interpolate(f, [URL_AT - 34, URL_AT - 18], [0, 1], clamp)}}>{copy.cta}</div>
			<div style={{position: 'absolute', left: 540, top: 1228, transform: `translate(-50%, -50%) scale(${pillIn})`}}>
				<div style={{position: 'absolute', inset: '-50px -30px', borderRadius: 999, background: 'radial-gradient(50% 60% at 50% 50%, rgba(16,185,129,0.32), rgba(59,130,246,0.16) 55%, rgba(255,255,255,0) 75%)', opacity: sent ? 1 : 0.7}} />
				<div
					style={{
						position: 'relative',
						width: pillW,
						height: 132,
						borderRadius: 999,
						background: '#fff',
						boxShadow: '0 26px 70px rgba(9,9,11,0.18), 0 0 0 2px #e4e4e7',
						display: 'flex',
						alignItems: 'center',
						padding: '0 18px 0 56px',
						overflow: 'hidden',
					}}
				>
					<div style={{flex: 1, fontSize: 64, fontWeight: 700, letterSpacing: -2, color: C.ink, whiteSpace: 'nowrap'}}>
						{url}
						{f >= URL_AT - 4 && !sent ? <Caret f={f} h={66} on={url.length < copy.url.length} /> : null}
					</div>
					<div style={{width: 96, height: 96, borderRadius: 48, background: url.length > 0 ? C.primary : C.muted, color: url.length > 0 ? '#fafafa' : C.mutedFg, display: 'grid', placeItems: 'center', transform: `scale(${press})`, flexShrink: 0}}>
						<ArrowUp size={50} strokeWidth={2.4} />
					</div>
				</div>
			</div>
			<Tap f={f} at={TAP_AT} x={540 + 400 - 18 - 48} y={1228} />

			{/* Google Play */}
			<div style={{position: 'absolute', left: 0, right: 0, top: 1338, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, opacity: interpolate(f, [TAP_AT + 14, TAP_AT + 30], [0, 1], clamp), transform: `translateY(${tw(f, [TAP_AT + 14, TAP_AT + 36], [24, 0])}px)`}}>
				<div style={{fontSize: 32, fontWeight: 500, color: C.mutedFg}}>{copy.play}</div>
				<Img src={staticFile('google-play-logo.png')} style={{width: 330}} />
			</div>
			<Flash f={f} at={0} dur={18} />
		</AbsoluteFill>
	);
};
