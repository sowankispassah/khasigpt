import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {GradientText} from '../components/Brand';
import {Drawer, Greeting, ICONS, IconName, AppHeader, ComposerDock} from '../components/AppUI';
import {NearbyScreen, PlaceCard} from '../components/FeatureUI';
import {Aurora, Flash, RiseWord} from '../components/Fx';
import {Phone} from '../components/Phone';
import {copy, drawer, features} from '../content';
import {C, clamp, DP, expoIn, expoOut, FONT, inOut, pop, tw} from '../theme';

const PHONE_Y = 1190;
const CARDS = [
	{i: 0, x: 300, y: 770, r: -6, ry: 14, at: 70},
	{i: 1, x: 780, y: 1010, r: 5, ry: -14, at: 84},
	{i: 2, x: 306, y: 1262, r: -4, ry: 12, at: 98},
];
const CARD_K = 1.36;
const SWITCH = 176;

/** 25–31 s · Explore Meghalaya (Nearby) with cards flying out, then every other feature. */
export const S5Explore: React.FC = () => {
	const f = useCurrentFrame();

	const enter = tw(f, [0, 40], [0, 1], expoOut);
	const toBack = tw(f, [196, 236], [0, 1], expoOut);
	const blast = tw(f, [318, 360], [0, 1], expoIn);
	const phoneX = interpolate(enter, [0, 1], [1750, 540]);
	const phoneS = 0.6 - toBack * 0.1 + blast * 1.9;
	const ry = interpolate(enter, [0, 1], [55, -6]) + (f > SWITCH ? 0 : 0) + tw(f, [SWITCH - 10, SWITCH + 20], [0, 12], inOut) - toBack * 8;
	const rx = 4 + toBack * 6 - blast * 10;
	const scroll = interpolate(f, [40, 150], [0, 560], {...clamp, easing: inOut});
	const drawerIn = tw(f, [SWITCH + 6, SWITCH + 30], [0, 1], expoOut);
	const exploreHeadline = f < SWITCH;

	return (
		<AbsoluteFill style={{background: C.bg, fontFamily: FONT, overflow: 'hidden'}}>
			<Aurora f={f} x={540} y={1050} w={1600} h={1600} opacity={0.5 + blast * 0.5} speed={1.2} />

			{/* headlines */}
			{exploreHeadline ? (
				<div style={{position: 'absolute', left: 0, right: 0, top: 256, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
					<RiseWord f={f} at={8} size={112} weight={800} exitAt={SWITCH - 14}>
						{copy.explore[0]}
					</RiseWord>
					<RiseWord f={f} at={15} size={112} weight={800} exitAt={SWITCH - 12}>
						<GradientText shift={interpolate(f, [0, SWITCH], [0, 100], clamp)}>{copy.explore[1]}</GradientText>
					</RiseWord>
				</div>
			) : (
				<div style={{position: 'absolute', left: 0, right: 0, top: 300, display: 'flex', justifyContent: 'center'}}>
					<RiseWord f={f} at={SWITCH} size={104} weight={800} exitAt={318}>
						{copy.more[0]}
					</RiseWord>
				</div>
			)}

			<Phone x={phoneX} y={PHONE_Y + toBack * 40} scale={phoneS} rx={rx} ry={ry} opacity={(1 - interpolate(f, [348, 360], [0, 1], clamp)) * (1 - toBack * 0.35 * (1 - blast))}>
				{f < SWITCH + 6 ? (
					<>
						<AppHeader title="Nearby" />
						<NearbyScreen scroll={scroll} hideCards={[]} />
					</>
				) : (
					<>
						<AppHeader />
						<Greeting top={250} />
						<ComposerDock k={DP} text="" />
						<div style={{position: 'absolute', inset: 0, background: `rgba(0,0,0,${0.3 * drawerIn})`, zIndex: 24}} />
						<div style={{position: 'absolute', inset: 0, transform: `translateX(${(drawerIn - 1) * 640}px)`, zIndex: 25}}>
							<Drawer items={drawer.items} history={drawer.history} highlight={Math.floor(interpolate(f, [SWITCH + 30, 300], [0, 7], clamp))} />
						</div>
					</>
				)}
			</Phone>

			{/* Explore cards emerge from the phone */}
			{CARDS.map((c) => {
				const t = tw(f, [c.at, c.at + 30], [0, 1], expoOut) * (1 - tw(f, [SWITCH - 22, SWITCH + 4], [0, 1], expoIn));
				if (t <= 0.001) return null;
				const x = interpolate(t, [0, 1], [phoneX, c.x]);
				const y = interpolate(t, [0, 1], [PHONE_Y + 120, c.y]);
				const s = interpolate(t, [0, 1], [0.35, 1]);
				return (
					<div key={c.i} style={{position: 'absolute', left: 0, top: 0, width: 1080, height: 1920, perspective: 1800, perspectiveOrigin: `${x}px ${y}px`}}>
						<div style={{position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) scale(${s}) rotate(${c.r * t}deg) rotateY(${c.ry * t}deg)`, opacity: Math.min(1, t * 2.5)}}>
							<PlaceCard k={CARD_K} i={c.i} style={{boxShadow: '0 30px 70px rgba(9,9,11,0.22), 0 0 0 1px #e4e4e7'}} />
						</div>
					</div>
				);
			})}

			{/* feature chips pop out of the drawer */}
			{features.map((ft, i) => {
				const left = i % 2 === 0;
				const row = Math.floor(i / 2);
				const at = SWITCH + 40 + i * 7;
				const t = pop(f, at, 13, 150);
				const gather = blast;
				if (f < at - 1) return null;
				const tx = left ? 292 : 786;
				const ty = 650 + row * 214 + (left ? 0 : 64);
				const x = interpolate(t, [0, 1], [phoneX - 40, tx]) * (1 - gather) + 540 * gather;
				const y = interpolate(t, [0, 1], [PHONE_Y - 300 + row * 90, ty]) * (1 - gather) + 1000 * gather;
				const Icon = ICONS[ft.icon as IconName];
				return (
					<div
						key={ft.label}
						style={{
							position: 'absolute',
							left: x,
							top: y,
							transform: `translate(-50%, -50%) scale(${Math.max(0, t) * (1 - gather * 0.7)}) rotate(${(left ? -4 : 4) * (1 - t)}deg)`,
							display: 'flex',
							alignItems: 'center',
							gap: 16,
							padding: '18px 28px 18px 18px',
							borderRadius: 999,
							background: '#fff',
							boxShadow: '0 18px 44px rgba(9,9,11,0.16), 0 0 0 2px #e4e4e7',
							fontSize: 33,
							fontWeight: 600,
							color: C.ink,
							whiteSpace: 'nowrap',
							opacity: 1 - gather,
						}}
					>
						<div style={{width: 58, height: 58, borderRadius: 29, background: i % 3 === 0 ? 'rgba(16,185,129,0.14)' : i % 3 === 1 ? 'rgba(0,128,153,0.12)' : 'rgba(59,130,246,0.12)', display: 'grid', placeItems: 'center', color: i % 3 === 0 ? '#047857' : i % 3 === 1 ? C.teal : '#1d4ed8'}}>
							<Icon size={31} strokeWidth={2} />
						</div>
						{ft.label}
					</div>
				);
			})}
			<Flash f={f} at={360} dur={14} />
		</AbsoluteFill>
	);
};
