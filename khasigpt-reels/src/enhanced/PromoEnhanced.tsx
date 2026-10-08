import React from 'react';
import {Audio, Video} from '@remotion/media';
import {AbsoluteFill, Img, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {ArrowDown, ArrowRight, ArrowUp, Globe} from 'lucide-react';
import {LogoBuild} from '../components/Brand';
import {Caret, Flash, RiseWord, Shockwave, Tap} from '../components/Fx';
import {C, clamp, expoIn, expoOut, FONT, inOut, kf, pop, sec, tw} from '../theme';
import {copy} from '../content';
import {CARD, ENH, toCanvas, VIEW} from './timing';

const s = (t: number) => sec(t);

/* ------------------------------------------------------------------ 0–5.43 s · opener */
const Opener: React.FC<{f: number}> = ({f}) => {
	const lock = s(ENH.logoLock);
	const ring = tw(f, [0, lock - 4], [0.3, 1]);
	const spearA = tw(f, [0, lock], [0.25, 1]);
	const spearB = tw(f, [4, lock + 2], [0.2, 1]);
	const shield = pop(f, 26, 12, 180, 0.8);
	const punch = kf(f, [0, lock, lock + 6, lock + 30], [1.5, 1, 1.08, 1], expoOut);
	const up = tw(f, [lock + 2, lock + 30], [0, 1]);
	const out = tw(f, [s(4.62), s(ENH.drop)], [0, 1], expoIn);
	const title = s(ENH.titleHit);
	return (
		<AbsoluteFill style={{transform: `scale(${1 + out * 0.7})`, opacity: 1 - out, filter: out > 0.02 ? `blur(${out * 14}px)` : undefined}}>
			<div style={{position: 'absolute', left: 540 - 170, top: interpolate(up, [0, 1], [800, 470]) - 171, transform: `scale(${punch * interpolate(up, [0, 1], [1, 0.62])}) rotate(${interpolate(f, [0, lock], [-30, 0], {...clamp, easing: expoOut})}deg)`}}>
				<LogoBuild size={340} state={{ring, shield, spearA, spearB, spin: interpolate(f, [0, lock], [-60, 0], clamp)}} />
			</div>
			<Shockwave f={f} at={lock} x={540} y={800} size={520} width={5} dur={28} />
			<Shockwave f={f} at={lock + 4} x={540} y={800} size={720} width={3} color={C.mutedFg} dur={32} />

			<div style={{position: 'absolute', left: 0, right: 0, top: 690, display: 'flex', justifyContent: 'center', gap: 28}}>
				{['Wanrah', 'sha', 'phi'].map((w, i) => (
					<RiseWord key={w} f={f} at={s(1.25) + i * 8} size={112} weight={600} color={C.ink} dur={20}>
						{w}
					</RiseWord>
				))}
			</div>
			<div style={{position: 'absolute', left: 0, right: 0, top: 830, display: 'flex', justifyContent: 'center', transform: `scale(${kf(f, [title, title + 5, title + 22], [1.18, 0.97, 1], expoOut)})`}}>
				<RiseWord f={f} at={title - 6} size={212} weight={800} dur={14}>
					KhasiGPT
				</RiseWord>
			</div>
			<Shockwave f={f} at={title} x={540} y={960} size={900} width={3} color={C.mutedFg} dur={30} />
			<div
				style={{
					position: 'absolute',
					left: 540,
					top: 1150,
					transform: `translate(-50%, 0) scale(${pop(f, s(ENH.tagHit), 14, 170)})`,
					padding: '22px 40px',
					borderRadius: 999,
					background: '#fff',
					boxShadow: '0 18px 44px rgba(9,9,11,0.14), 0 0 0 2px #e4e4e7',
					fontSize: 46,
					fontWeight: 600,
					letterSpacing: -0.8,
					whiteSpace: 'nowrap',
				}}
			>
				{copy.hookSub}
			</div>
		</AbsoluteFill>
	);
};

/* ------------------------------------------------------------------ 5.43–13.72 s · the real recording */
type Cam = {t: number; x: number; y: number; z: number};
const CARD_CENTER = toCanvas(VIEW.x + VIEW.w / 2, VIEW.y + VIEW.h / 2);
const CAMS: Cam[] = [
	{t: ENH.drop, x: CARD_CENTER.x, y: CARD_CENTER.y, z: 1},
	{t: 6.85, x: CARD_CENTER.x, y: CARD_CENTER.y, z: 1.07},
	{t: 7.15, ...toCanvas(300, 1012), z: 1.72},
	{t: ENH.modalOpen, ...toCanvas(300, 1012), z: 1.78},
	{t: 8.75, ...toCanvas(537, 952), z: 1.6},
	{t: ENH.yesTap, ...toCanvas(560, 958), z: 1.66},
	{t: 10.55, ...toCanvas(540, 975), z: 1.22},
	{t: ENH.khasiHome, ...toCanvas(540, 975), z: 1.2},
	{t: 11.6, ...toCanvas(540, 843), z: 1.8},
	{t: ENH.pullBack, ...toCanvas(540, 843), z: 1.86},
	{t: 12.95, x: CARD_CENTER.x, y: CARD_CENTER.y, z: 1.04},
	{t: ENH.demoEnd, x: CARD_CENTER.x, y: CARD_CENTER.y, z: 1.08},
];

const camAt = (time: number) => {
	const ts = CAMS.map((c) => c.t);
	const o = {...clamp, easing: inOut};
	return {
		x: interpolate(time, ts, CAMS.map((c) => c.x), o),
		y: interpolate(time, ts, CAMS.map((c) => c.y), o),
		z: interpolate(time, ts, CAMS.map((c) => c.z), o),
	};
};

const CAPTIONS: {from: number; to: number; lines: React.ReactNode[]}[] = [
	{from: 5.55, to: 6.95, lines: ['Chat in', 'your language.']},
	{from: 7.14, to: 8.42, lines: ['Pick', 'Khasi.']},
	{from: 8.62, to: 10.15, lines: ['Switch the', 'whole app.']},
	{from: 10.34, to: 11.2, lines: ['One tap.']},
	{from: 11.4, to: 13.62, lines: ['Now it speaks', 'Khasi.']},
];

const LangPill: React.FC<{label: string; active: number}> = ({label, active}) => (
	<div
		style={{
			display: 'flex',
			alignItems: 'center',
			gap: 14,
			padding: '18px 30px',
			borderRadius: 999,
			background: active > 0.5 ? C.primary : '#fff',
			color: active > 0.5 ? '#fafafa' : C.ink,
			boxShadow: active > 0.5 ? '0 16px 40px rgba(9,9,11,0.25)' : '0 10px 26px rgba(9,9,11,0.1), 0 0 0 2px #e4e4e7',
			fontSize: 40,
			fontWeight: 600,
			transform: `scale(${1 + active * 0.06})`,
		}}
	>
		<Globe size={36} strokeWidth={2} />
		{label}
	</div>
);

const Demo: React.FC<{f: number}> = ({f}) => {
	const time = f / 60;
	const cam = camAt(time);
	const enter = pop(f, s(ENH.drop), 15, 140);
	const exit = tw(f, [s(ENH.demoEnd) - 14, s(ENH.demoEnd) + 4], [0, 1], expoIn);
	const ax = 540;
	const ay = 960;
	const switched = tw(f, [s(ENH.khasiHome) - 10, s(ENH.khasiHome) + 10], [0, 1]);
	const chipsIn = pop(f, s(5.75), 15, 150) * (1 - exit);
	const chip = (sx: number, sy: number) => {
		const p = toCanvas(sx, sy);
		return {x: ax + (p.x - cam.x) * cam.z, y: ay + (p.y - cam.y) * cam.z};
	};
	const chipTap = chip(190, 1097);
	const khasiTap = chip(205, 1036);
	const yesTap = chip(700, 1003);

	return (
		<AbsoluteFill style={{opacity: 1 - exit}}>
			{/* camera */}
			<AbsoluteFill style={{transformOrigin: '0 0', transform: `translate(${ax - cam.x * cam.z}px, ${ay - cam.y * cam.z}px) scale(${cam.z})`}}>
				<div
					style={{
						position: 'absolute',
						left: CARD.x,
						top: CARD.y,
						width: VIEW.w,
						height: VIEW.h,
						borderRadius: 26,
						overflow: 'hidden',
						background: '#fff',
						boxShadow: '0 10px 28px rgba(9,9,11,0.08), 0 0 0 2px #e4e4e7',
						transform: `scale(${interpolate(enter, [0, 1], [0.82, 1]) * (1 - exit * 0.2)}) translateY(${(1 - enter) * 60}px)`,
					}}
				>
					<Sequence from={s(ENH.drop) - 2} durationInFrames={s(ENH.freezeAt) - s(ENH.drop) + 2} layout="none">
						<Video src={staticFile('source/promo-final.mp4')} trimBefore={s(ENH.drop + ENH.lead) - 2} muted style={{position: 'absolute', left: -VIEW.x, top: -VIEW.y, width: 1080, height: 1920}} />
					</Sequence>
					{f >= s(ENH.freezeAt) && f < s(ENH.yesTap) ? (
						<Img src={staticFile('source/modal-freeze.png')} style={{position: 'absolute', left: -VIEW.x, top: -VIEW.y, width: 1080, height: 1920}} />
					) : null}
					<Sequence from={s(ENH.yesTap)} durationInFrames={s(ENH.demoEnd) - s(ENH.yesTap) + 2} layout="none">
						<Video src={staticFile('source/promo-final.mp4')} trimBefore={s(ENH.yesTap)} muted style={{position: 'absolute', left: -VIEW.x, top: -VIEW.y, width: 1080, height: 1920}} />
					</Sequence>
				</div>
			</AbsoluteFill>

			<Tap f={f} at={s(ENH.chipTap)} x={chipTap.x} y={chipTap.y} />
			<Tap f={f} at={s(ENH.khasiTap)} x={khasiTap.x} y={khasiTap.y} />
			<Tap f={f} at={s(ENH.yesTap)} x={yesTap.x} y={yesTap.y} />

			{/* captions */}
			{CAPTIONS.map((c) => {
				if (f < s(c.from) - 2 || f > s(c.to) + 18) return null;
				return (
					<div key={c.from} style={{position: 'absolute', left: 0, right: 0, top: 286, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
						{c.lines.map((line, i) => (
							<RiseWord key={i} f={f} at={s(c.from) + i * 5} size={108} weight={800} dur={18} exitAt={s(c.to)}>
								{line}
							</RiseWord>
						))}
					</div>
				);
			})}

			{/* English → Khasi indicator */}
			<div style={{position: 'absolute', left: 540, top: 1300, transform: `translate(-50%, 0) scale(${chipsIn})`, display: 'flex', alignItems: 'center', gap: 22}}>
				<LangPill label="English" active={1 - switched} />
				<ArrowRight size={44} strokeWidth={2.4} color={C.mutedFg} />
				<LangPill label="Khasi" active={switched} />
			</div>
			<Flash f={f} at={s(ENH.drop)} dur={10} peak={0.75} />
		</AbsoluteFill>
	);
};

/* ------------------------------------------------------------------ 13.72–21.03 s · end card */
const EndCard: React.FC<{f: number}> = ({f}) => {
	const start = s(ENH.demoEnd);
	const lock = s(ENH.endLock);
	const ring = tw(f, [start, lock - 2], [0.3, 1]);
	const spearA = tw(f, [start, lock], [0.25, 1]);
	const spearB = tw(f, [start + 3, lock + 1], [0.2, 1]);
	const shield = pop(f, start + 8, 12, 190, 0.7);
	const punch = kf(f, [start, lock, lock + 6, lock + 26], [1.4, 1, 1.07, 1], expoOut);
	const toLockup = tw(f, [lock + 10, lock + 36], [0, 1]);
	const up = tw(f, [s(ENH.lockupUp), s(ENH.lockupUp) + 36], [0, 1]);
	const lockY = interpolate(up, [0, 1], [880, 480]);
	const logoSize = interpolate(toLockup, [0, 1], [300, 132]);
	const logoX = interpolate(toLockup, [0, 1], [540, 190]);
	const url = copy.url.slice(0, Math.max(0, Math.min(copy.url.length, Math.floor((f - s(ENH.urlType)) / 3.5))));
	const tapAt = s(ENH.urlTap);
	const shine = interpolate(f, [s(ENH.play) + 20, s(ENH.play) + 56], [-40, 140], clamp);
	const bounce = Math.abs(Math.sin(((f - s(ENH.bio)) / 60) * Math.PI * 1.54)) * 16;

	return (
		<AbsoluteFill>
			<div style={{position: 'absolute', left: logoX - logoSize / 2, top: lockY - logoSize / 2, transform: `scale(${punch}) rotate(${interpolate(f, [start, lock], [-28, 0], {...clamp, easing: expoOut})}deg)`}}>
				<LogoBuild size={logoSize} state={{ring, shield, spearA, spearB, spin: interpolate(f, [start, lock], [-60, 0], clamp)}} />
			</div>
			<Shockwave f={f} at={lock} x={540} y={880} size={460} width={5} dur={28} />
			<div style={{position: 'absolute', left: 275, top: lockY - 78, display: 'flex', alignItems: 'flex-start'}}>
				{'KhasiGPT'.split('').map((ch, i) => (
					<RiseWord key={i} f={f} at={lock + 14 + i * 2} size={146} weight={700} dur={20} tracking={-6}>
						{ch}
					</RiseWord>
				))}
				<div style={{marginLeft: 14, marginTop: 14, padding: '6px 16px', borderRadius: 999, border: `2px solid ${C.border}`, fontSize: 30, fontWeight: 600, opacity: interpolate(f, [lock + 34, lock + 44], [0, 1], clamp)}}>1.0</div>
			</div>

			<div style={{position: 'absolute', left: 0, right: 0, top: 640, display: 'flex', justifyContent: 'center'}}>
				<RiseWord f={f} at={s(ENH.download)} size={54} weight={600} dur={18}>
					{copy.play}
				</RiseWord>
			</div>
			<div
				style={{
					position: 'absolute',
					left: 540,
					top: 732,
					transform: `translate(-50%, 0) scale(${pop(f, s(ENH.play), 13, 160)})`,
					width: 600,
					height: 150,
					borderRadius: 34,
					background: '#fff',
					boxShadow: '0 22px 50px rgba(9,9,11,0.16), 0 0 0 2px #e4e4e7',
					display: 'grid',
					placeItems: 'center',
					overflow: 'hidden',
				}}
			>
				<Img src={staticFile('google-play-logo.png')} style={{width: 470}} />
				<div style={{position: 'absolute', top: -60, bottom: -60, width: 120, left: `${shine}%`, background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.85), rgba(255,255,255,0))', transform: 'rotate(18deg)'}} />
			</div>
			<div style={{position: 'absolute', left: 0, right: 0, top: 930, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, opacity: interpolate(f, [s(ENH.bio), s(ENH.bio) + 8], [0, 1], clamp), transform: `translateY(${tw(f, [s(ENH.bio), s(ENH.bio) + 18], [30, 0])}px)`}}>
				<span style={{fontSize: 52, fontWeight: 700, letterSpacing: -1}}>Link ha bio</span>
				<div style={{width: 64, height: 64, borderRadius: 32, background: C.primary, color: '#fff', display: 'grid', placeItems: 'center', transform: `translateY(${f > s(ENH.bio) ? bounce : 0}px)`}}>
					<ArrowDown size={38} strokeWidth={2.6} />
				</div>
			</div>
			<div style={{position: 'absolute', left: 0, right: 0, top: 1052, textAlign: 'center', fontSize: 42, fontWeight: 500, color: C.mutedFg, opacity: interpolate(f, [s(ENH.orVisit), s(ENH.orVisit) + 10], [0, 1], clamp)}}>Lane leit ha</div>
			<div style={{position: 'absolute', left: 540, top: 1196, transform: `translate(-50%, -50%) scale(${pop(f, s(ENH.urlPill), 15, 150)})`}}>
				<div style={{position: 'relative', width: interpolate(f, [s(ENH.urlPill), s(ENH.urlPill) + 18], [140, 780], {...clamp, easing: expoOut}), height: 132, borderRadius: 999, background: '#fff', boxShadow: '0 26px 70px rgba(9,9,11,0.18), 0 0 0 2px #e4e4e7', display: 'flex', alignItems: 'center', padding: '0 18px 0 56px', overflow: 'hidden'}}>
					<div style={{flex: 1, fontSize: 66, fontWeight: 700, letterSpacing: -2, color: C.ink, whiteSpace: 'nowrap'}}>
						{url}
						{f < tapAt ? <Caret f={f} h={68} on={url.length < copy.url.length} /> : null}
					</div>
					<div style={{width: 96, height: 96, borderRadius: 48, flexShrink: 0, background: url ? C.primary : C.muted, color: url ? '#fafafa' : C.mutedFg, display: 'grid', placeItems: 'center', transform: `scale(${kf(f, [tapAt - 4, tapAt, tapAt + 10], [1, 0.84, 1])})`}}>
						<ArrowUp size={50} strokeWidth={2.4} />
					</div>
				</div>
			</div>
			<Tap f={f} at={tapAt} x={540 + 390 - 18 - 48} y={1196} />
			<Flash f={f} at={start} dur={14} peak={0.8} />
		</AbsoluteFill>
	);
};

/** Enhanced cut of the user's 21 s promo, on its original soundtrack plus synced effects. */
export const PromoEnhanced: React.FC = () => {
	const f = useCurrentFrame();
	return (
		<AbsoluteFill style={{background: C.bg, fontFamily: FONT, color: C.ink, overflow: 'hidden'}}>
			<Audio src={staticFile('promo-enhanced-soundtrack.wav')} />
			{f < s(ENH.drop) + 2 ? <Opener f={f} /> : null}
			{f >= s(ENH.drop) - 2 && f < s(ENH.demoEnd) + 6 ? <Demo f={f} /> : null}
			{f >= s(ENH.demoEnd) - 2 ? <EndCard f={f} /> : null}
		</AbsoluteFill>
	);
};
