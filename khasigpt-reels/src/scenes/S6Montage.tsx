import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {GradientText} from '../components/Brand';
import {Aurora, Caret, Flash} from '../components/Fx';
import {Phone} from '../components/Phone';
import {AnswerScreen, DrawerScreen, HomeScreen, ImageChatScreen, NearbyListScreen, ViewerScreen, VoiceScreen} from '../components/Screens';
import {copy, voice} from '../content';
import {C, clamp, expoIn, expoOut, FONT, inOut, pop, tw} from '../theme';

const COL_X = [128, 540, 952];
const SPACING = 930;
const PHONE_S = 0.42;
const SPEED = [-2.6, 2.2, -2.9];

const screenFor = (c: number, r: number, f: number) => {
	const n = (((c * 3 + r * 2) % 8) + 8) % 8;
	switch (n) {
		case 0:
			return <HomeScreen />;
		case 1:
			return <AnswerScreen f={f} />;
		case 2:
			return <VoiceScreen f={f} />;
		case 3:
			return <ImageChatScreen f={f} />;
		case 4:
			return <NearbyListScreen scroll={520} />;
		case 5:
			return <DrawerScreen />;
		case 6:
			return <ViewerScreen f={f} />;
		default:
			return <HomeScreen text={voice.userSays} />;
	}
};

/** 31–37 s · Tilted wall of real KhasiGPT screens with a typed tagline. */
export const S6Montage: React.FC = () => {
	const f = useCurrentFrame();
	const converge = tw(f, [292, 352], [0, 1], expoIn);
	const planeScale = interpolate(f, [0, 292], [1.28, 1.02], {...clamp, easing: inOut}) * (1 - converge * 0.82);
	const rotX = 26 * (1 - converge);
	const rotZ = interpolate(f, [0, 292], [-17, -11], clamp) * (1 - converge);

	const tag = copy.tagline; // "Your language. Your AI."
	const split = tag.indexOf('Your AI.');
	const shown = Math.max(0, Math.min(tag.length, Math.floor((f - 84) / 2.7)));
	const pillIn = pop(f, 66, 14, 150) * (1 - tw(f, [252, 276], [0, 1], expoIn));
	const pillW = interpolate(f, [66, 90], [150, 920], {...clamp, easing: expoOut});

	return (
		<AbsoluteFill style={{background: C.bg, fontFamily: FONT, overflow: 'hidden'}}>
			<Aurora f={f} x={540} y={960} w={1800} h={2000} opacity={0.45 + converge * 0.55} speed={1.4} />
			<div style={{position: 'absolute', inset: 0, perspective: 2600, opacity: 1 - interpolate(f, [330, 356], [0, 1], clamp)}}>
				<div style={{position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transform: `rotateX(${rotX}deg) rotateZ(${rotZ}deg) scale(${planeScale})`, transformOrigin: '540px 960px'}}>
					{COL_X.map((x, c) => {
						const offset = f * SPEED[c] + c * 310;
						return [-2, -1, 0, 1, 2].map((r) => {
							const raw = 960 + r * SPACING + offset;
							const period = SPACING * 5;
							const lo = 960 - SPACING * 2.5;
							const k = Math.floor((raw - lo) / period);
							const y = raw - k * period;
							const id = r + k * 5;
							return (
								<Phone key={`${c}-${r}`} x={x} y={y} scale={PHONE_S} layers={0} shadow={0.5} perspective={100000}>
									{screenFor(c, id, f)}
								</Phone>
							);
						});
					})}
				</div>
			</div>

			{/* typed tagline pill */}
			<div style={{position: 'absolute', left: 540, top: 960, transform: `translate(-50%, -50%) scale(${pillIn})`}}>
				<div style={{position: 'absolute', inset: '-60px -40px', borderRadius: 999, background: 'radial-gradient(50% 60% at 50% 50%, rgba(16,185,129,0.35), rgba(59,130,246,0.18) 55%, rgba(255,255,255,0) 75%)'}} />
				<div
					style={{
						position: 'relative',
						width: pillW,
						height: 150,
						borderRadius: 999,
						background: '#fff',
						boxShadow: '0 30px 80px rgba(9,9,11,0.22), 0 0 0 2px #e4e4e7',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						fontSize: 66,
						fontWeight: 700,
						letterSpacing: -2,
						color: C.ink,
						whiteSpace: 'nowrap',
						overflow: 'hidden',
					}}
				>
					<span>{tag.slice(0, Math.min(split, shown))}</span>
					{shown > split ? <GradientText>{tag.slice(split, shown)}</GradientText> : null}
					{f >= 80 ? <Caret f={f} h={70} on={shown < tag.length} /> : null}
				</div>
			</div>
			<Flash f={f} at={0} dur={16} />
			<Flash f={f} at={360} dur={10} />
		</AbsoluteFill>
	);
};
