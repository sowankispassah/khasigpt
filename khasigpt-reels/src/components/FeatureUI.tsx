import React from 'react';
import {Img, staticFile} from 'remotion';
import {Compass, LocateFixed, MapPin, Mic, Navigation, Search} from 'lucide-react';
import {C, DP, FONT} from '../theme';
import {explore, voice} from '../content';
import {Painting} from './Painting';

type K = {k?: number};

/* ------------------------------------------------------------------ voice */

export type VoiceStatus = 'Listening...' | 'Thinking...' | 'Speaking...';

/** Bar heights (0..1) for the five native visualiser bars. */
export const voiceBars = (f: number, status: VoiceStatus, level: number) => {
	const base = [0.55, 0.85, 1, 0.75, 0.6];
	return base.map((b, i) => {
		if (status === 'Thinking...') return 0.24 + 0.06 * Math.sin(f * 0.12 + i);
		if (status === 'Speaking...') {
			const targets = [0.42, 0.68, 0.94, 0.56, 0.82];
			const w = 0.5 + 0.5 * Math.sin((f / 57) * Math.PI * 2 - i * 0.7);
			return 0.24 + (targets[i] - 0.24) * w * (0.6 + level * 0.6);
		}
		const jitter = 0.5 + 0.5 * Math.sin(f * 0.45 + i * 1.9) * Math.cos(f * 0.21 + i);
		return Math.max(0.24, b * level * (0.55 + jitter * 0.6));
	});
};

export const VoiceModal: React.FC<K & {f: number; status: VoiceStatus; level: number; lift?: number; glass?: boolean}> = ({k = DP, f, status, level, lift = 0, glass = false}) => {
	const active = status !== 'Thinking...';
	const bars = voiceBars(f, status, level);
	const pulse = active ? 1 + level * 0.18 * (0.6 + 0.4 * Math.sin(f * 0.3)) : 1;
	return (
		<div
			style={{
				width: 380 * k,
				borderRadius: 8 * k,
				padding: 20 * k,
				background: glass ? 'rgba(255,255,255,0.86)' : '#fff',
				backdropFilter: glass ? 'blur(16px)' : undefined,
				fontFamily: FONT,
				boxShadow: `0 ${(10 + lift * 30) * k}px ${(30 + lift * 50) * k}px rgba(0,0,0,${0.16 + lift * 0.14})`,
			}}
		>
			<div style={{display: 'flex', alignItems: 'center', gap: 14 * k}}>
				<div style={{width: 48 * k, height: 48 * k, borderRadius: '50%', background: C.muted, display: 'grid', placeItems: 'center', color: C.ink}}>
					<Mic size={24 * k} strokeWidth={1.9} />
				</div>
				<div>
					<div style={{fontSize: 18 * k, fontWeight: 700, color: C.ink}}>{voice.title}</div>
					<div style={{fontSize: 13 * k, color: C.mutedFg, marginTop: 2 * k}}>{status}</div>
				</div>
			</div>
			<div style={{marginTop: 20 * k, height: 250 * k, borderRadius: 12 * k, border: `${k}px solid ${C.border}`, background: 'rgba(244,244,245,0.35)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
				<div style={{position: 'relative', width: 124 * k, height: 124 * k}}>
					<div style={{position: 'absolute', inset: 0, borderRadius: '50%', border: `${2 * k}px solid ${C.primary}`, opacity: active ? 0.22 : 0.12, transform: `scale(${pulse})`}} />
					<div style={{position: 'absolute', inset: 18 * k, borderRadius: '50%', border: `${2 * k}px solid ${C.primary}`, opacity: active ? 0.18 : 0.1, transform: `scale(${1 + (pulse - 1) * 0.6})`}} />
					<div style={{position: 'absolute', inset: 26 * k, borderRadius: '50%', background: '#fff', boxShadow: `0 ${2 * k}px ${8 * k}px rgba(0,0,0,0.12)`, display: 'grid', placeItems: 'center', color: C.ink}}>
						<Mic size={32 * k} strokeWidth={1.9} />
					</div>
				</div>
				<div style={{marginTop: 26 * k, height: 54 * k, display: 'flex', gap: 8 * k, alignItems: 'center'}}>
					{bars.map((h, i) => (
						<div key={i} style={{width: 7 * k, height: 54 * k * h, borderRadius: 4 * k, background: active ? 'rgba(24,24,27,0.78)' : 'rgba(9,9,11,0.34)'}} />
					))}
				</div>
			</div>
			<div style={{display: 'flex', justifyContent: 'flex-end', gap: 10 * k, marginTop: 18 * k}}>
				<div style={{height: 42 * k, padding: `0 ${16 * k}px`, borderRadius: 6 * k, border: `${k}px solid ${C.border}`, display: 'grid', placeItems: 'center', fontSize: 15 * k, fontWeight: 600}}>{voice.cancel}</div>
				<div style={{height: 42 * k, padding: `0 ${16 * k}px`, borderRadius: 6 * k, background: C.primary, color: '#fafafa', display: 'grid', placeItems: 'center', fontSize: 15 * k, fontWeight: 600}}>{voice.end}</div>
			</div>
		</div>
	);
};

/* ------------------------------------------------------------------ image generation */

/** Loading frame from components/image-generation-progress.module.css. */
export const ImageGenerating: React.FC<K & {f: number; progress: number; size?: number}> = ({k = DP, f, progress, size = 238}) => {
	const t = f / 60;
	return (
		<div style={{position: 'relative', width: size * k, height: size * k, borderRadius: 18 * k, overflow: 'hidden', border: `${k}px solid ${C.border}`, background: '#1c343b'}}>
			<div
				style={{
					position: 'absolute',
					inset: -20 * k,
					background: `radial-gradient(45% 45% at ${12 + Math.sin(t * 1.3) * 6}% ${18 + Math.cos(t) * 5}%, rgba(185,225,255,0.98), rgba(185,225,255,0) 70%),
						radial-gradient(50% 50% at ${78 + Math.cos(t * 1.1) * 6}% ${68 + Math.sin(t * 0.9) * 6}%, rgba(60,11,10,0.92), rgba(60,11,10,0) 70%),
						radial-gradient(45% 45% at ${88 + Math.sin(t * 0.7) * 5}% ${14 + Math.cos(t * 1.4) * 5}%, rgba(0,128,153,0.95), rgba(0,128,153,0) 70%),
						linear-gradient(135deg, #a7d7f4, #4b858e 45%, #102b32)`,
					filter: `blur(${10 * k}px) saturate(1.35)`,
				}}
			/>
			<div
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					top: 0,
					height: '100%',
					transformOrigin: 'top',
					transform: `scaleY(${0.02 + progress * 0.92})`,
					background: 'linear-gradient(180deg, rgba(246,251,255,0.86), rgba(18,35,40,0.16))',
					backdropFilter: 'blur(6px)',
				}}
			/>
			<div style={{position: 'absolute', left: 0, right: 0, bottom: 12 * k, display: 'flex', justifyContent: 'center'}}>
				<div style={{padding: `${6 * k}px ${12 * k}px`, borderRadius: 999, background: 'rgba(255,255,255,0.84)', color: C.mutedFg, fontSize: 13 * k, fontWeight: 500, fontFamily: FONT}}>Generating...</div>
			</div>
		</div>
	);
};

/**
 * The generated image, with a diffusion-style resolve: static → blurred colour → sharp.
 * resolve: 0 (noise) → 1 (final)
 */
export const GeneratedImage: React.FC<{size: number; f: number; resolve?: number; radius?: number; panX?: number; panY?: number; zoom?: number; border?: boolean}> = ({
	size,
	f,
	resolve = 1,
	radius = 12 * DP,
	panX = 0,
	panY = 0,
	zoom = 1,
	border = true,
}) => {
	const blur = (1 - resolve) ** 1.6 * size * 0.05;
	const noise = Math.max(0, 1 - resolve * 1.6);
	return (
		<div style={{position: 'relative', width: size, height: size, borderRadius: radius, overflow: 'hidden', border: border ? `${Math.max(1, size / 240)}px solid ${C.border}` : undefined, background: '#1c343b'}}>
			<div style={{position: 'absolute', inset: 0, filter: resolve < 1 ? `blur(${blur}px) saturate(${0.6 + resolve * 0.5})` : undefined, transform: resolve < 1 ? `scale(${1.08 - resolve * 0.08})` : undefined}}>
				<Painting size={size} f={f} panX={panX} panY={panY} zoom={zoom} />
			</div>
			{noise > 0 ? (
				<svg width={size} height={size} style={{position: 'absolute', inset: 0, opacity: noise, mixBlendMode: 'overlay'}}>
					<filter id={`n${Math.round(size)}`}>
						<feTurbulence type="fractalNoise" baseFrequency={0.75} numOctaves={2} seed={Math.floor(f / 2)} />
						<feColorMatrix type="saturate" values="0" />
					</filter>
					<rect width="100%" height="100%" filter={`url(#n${Math.round(size)})`} />
				</svg>
			) : null}
		</div>
	);
};

/* ------------------------------------------------------------------ Nearby / Explore Meghalaya */

export const PlaceCard: React.FC<K & {i: number; width?: number; style?: React.CSSProperties}> = ({k = DP, i, width = 380, style}) => {
	const p = explore.places[i];
	return (
		<div style={{width: width * k, borderRadius: 12 * k, border: `${k}px solid ${C.border}`, background: '#fff', overflow: 'hidden', boxShadow: `0 ${k}px ${3 * k}px rgba(0,0,0,0.05)`, fontFamily: FONT, ...style}}>
			<div style={{width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', background: C.muted}}>
				<Img src={staticFile(p.img)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
			</div>
			<div style={{padding: 14 * k}}>
				<div style={{fontSize: 17 * k, fontWeight: 600, color: C.ink, lineHeight: 1.25}}>{p.name}</div>
				<div style={{fontSize: 14 * k, color: C.mutedFg, marginTop: 4 * k}}>{p.area}</div>
				<div style={{display: 'flex', gap: 12 * k, alignItems: 'center', fontSize: 13 * k, color: C.mutedFg, marginTop: 8 * k}}>
					<span style={{display: 'flex', alignItems: 'center', gap: 4 * k}}>
						<Navigation size={13 * k} strokeWidth={2} />
						{p.km < 1 ? `${Math.round(p.km * 1000)} m` : `${p.km} km`}
					</span>
					<span style={{padding: `${2 * k}px ${8 * k}px`, borderRadius: 999, background: C.muted, color: C.ink, fontSize: 12 * k, fontWeight: 500}}>{p.kind}</span>
				</div>
			</div>
		</div>
	);
};

export const NearbyScreen: React.FC<K & {scroll: number; activeChip?: number; hideCards?: number[]}> = ({k = DP, scroll, activeChip = 0, hideCards = []}) => (
	<div style={{position: 'absolute', left: 0, right: 0, top: 84 * k, bottom: 0, overflow: 'hidden', fontFamily: FONT}}>
		<div style={{padding: `${8 * k}px ${16 * k}px`, transform: `translateY(${-scroll * k}px)`}}>
			<div style={{fontSize: 28 * k, fontWeight: 800, color: C.ink, letterSpacing: -0.5 * k}}>{explore.title}</div>
			<div style={{fontSize: 15 * k, color: C.mutedFg, marginTop: 6 * k, lineHeight: 1.4}}>{explore.subtitle}</div>
			<div style={{marginTop: 16 * k, borderRadius: 16 * k, border: `${k}px solid ${C.border}`, padding: 14 * k}}>
				<div style={{display: 'flex', alignItems: 'center', gap: 8 * k}}>
					<MapPin size={18 * k} strokeWidth={2} />
					<span style={{fontSize: 16 * k, fontWeight: 700}}>{explore.location}</span>
					<div style={{flex: 1}} />
					<span style={{fontSize: 13 * k, padding: `${5 * k}px ${10 * k}px`, borderRadius: 999, border: `${k}px solid ${C.border}`, fontWeight: 500}}>Change</span>
				</div>
				<div style={{marginTop: 12 * k, display: 'flex', justifyContent: 'space-between', fontSize: 14 * k}}>
					<span style={{color: C.mutedFg}}>Search radius</span>
					<span style={{fontWeight: 600}}>{explore.radius} km</span>
				</div>
				<div style={{position: 'relative', height: 6 * k, borderRadius: 3 * k, background: C.muted, marginTop: 10 * k}}>
					<div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%', borderRadius: 3 * k, background: C.primary}} />
					<div style={{position: 'absolute', right: -8 * k, top: -7 * k, width: 20 * k, height: 20 * k, borderRadius: '50%', background: '#fff', border: `${2 * k}px solid ${C.primary}`}} />
				</div>
				<div style={{display: 'flex', gap: 8 * k, marginTop: 14 * k}}>
					<div style={{flex: 1, height: 44 * k, borderRadius: 12 * k, border: `${k}px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 * k, padding: `0 ${10 * k}px`, fontSize: 13 * k, color: C.mutedFg, whiteSpace: 'nowrap', overflow: 'hidden'}}>
						<Search size={16 * k} strokeWidth={2} />
						Search restaurants, shops…
					</div>
					<div style={{height: 44 * k, padding: `0 ${14 * k}px`, borderRadius: 12 * k, background: C.primary, color: '#fafafa', display: 'grid', placeItems: 'center', fontSize: 14 * k, fontWeight: 600}}>Search</div>
				</div>
			</div>
			<div style={{fontSize: 20 * k, fontWeight: 600, marginTop: 20 * k}}>{explore.heading}</div>
			<div style={{display: 'flex', gap: 8 * k, marginTop: 10 * k, flexWrap: 'nowrap', overflow: 'hidden'}}>
				{explore.categories.map((c, i) => (
					<div key={c} style={{minHeight: 38 * k, padding: `0 ${14 * k}px`, borderRadius: 999, border: `${k}px solid ${i === activeChip ? C.primary : C.border}`, background: i === activeChip ? 'rgba(24,24,27,0.05)' : '#fff', display: 'flex', alignItems: 'center', gap: 6 * k, fontSize: 14 * k, fontWeight: 500, whiteSpace: 'nowrap'}}>
						{i === 0 ? <Compass size={15 * k} strokeWidth={2} /> : null}
						{c}
					</div>
				))}
			</div>
			<div style={{fontSize: 18 * k, fontWeight: 600, marginTop: 18 * k}}>Around Shillong</div>
			<div style={{fontSize: 13 * k, color: C.mutedFg, marginTop: 2 * k, marginBottom: 12 * k}}>
				Within {explore.radius} km · Showing {explore.places.length} of 48 results
			</div>
			{explore.places.map((_, i) => (
				<PlaceCard key={i} k={k} i={i} style={{marginBottom: 14 * k, opacity: hideCards.includes(i) ? 0 : 1}} />
			))}
		</div>
	</div>
);

export const NearbyIntro: React.FC<K> = ({k = DP}) => (
	<div style={{display: 'flex', flexDirection: 'column', gap: 10 * k, fontFamily: FONT}}>
		<div style={{height: 56 * k, borderRadius: 12 * k, background: C.primary, color: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 * k, fontSize: 16 * k, fontWeight: 600}}>
			<LocateFixed size={18 * k} />
			Use My Current Location
		</div>
	</div>
);
