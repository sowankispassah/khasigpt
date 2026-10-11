import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {GradientText, LogoBuild} from '../components/Brand';
import {Aurora, RiseWord, Shockwave} from '../components/Fx';
import {copy} from '../content';
import {C, clamp, expoIn, expoOut, FONT, kf, pop, tw} from '../theme';

/** 0–3 s · Logo assembles in the first half-second, then the hook lands. */
export const S1Hook: React.FC = () => {
	const f = useCurrentFrame();

	// logo assembly
	const ring = tw(f, [0, 22], [0.32, 1]);
	const spearA = tw(f, [0, 18], [0.3, 1]);
	const spearB = tw(f, [2, 21], [0.22, 1]);
	const shield = pop(f, 5, 11, 190, 0.7);
	const punch = kf(f, [0, 20, 25, 42], [1.45, 1, 1.07, 1], expoOut);

	// logo travels into the lockup
	const lock = tw(f, [40, 70], [0, 1]);
	const logoSize = interpolate(lock, [0, 1], [430, 132]);
	const logoX = interpolate(lock, [0, 1], [540, 245]);
	const logoY = interpolate(lock, [0, 1], [860, 452]);

	// whole hook collapses into a dot that becomes the next scene's composer
	const collapse = tw(f, [150, 174], [1, 0.0], expoIn);
	const fadeAll = interpolate(f, [168, 176], [1, 0], clamp);

	const letters = 'KhasiGPT'.split('');

	return (
		<AbsoluteFill style={{background: C.bg, fontFamily: FONT, overflow: 'hidden'}}>
			<Aurora f={f} x={540} y={interpolate(lock, [0, 1], [860, 900])} w={interpolate(f, [0, 20, 60], [1150, 1350, 1500], clamp)} h={interpolate(f, [0, 20, 60], [1150, 1350, 1700], clamp)} opacity={interpolate(f, [0, 150, 172], [1, 0.9, 0], clamp) * interpolate(lock, [0, 1], [1, 0.75])} speed={1.4} />
			<AbsoluteFill style={{transform: `scale(${collapse})`, transformOrigin: '540px 875px', opacity: fadeAll}}>
				<div style={{position: 'absolute', left: logoX - logoSize / 2, top: logoY - logoSize / 2, transform: `scale(${punch}) rotate(${interpolate(f, [0, 24], [-32, 0], {...clamp, easing: expoOut})}deg)`}}>
					<LogoBuild size={logoSize} state={{ring, shield, spearA, spearB, spin: interpolate(f, [0, 24], [-60, 0], clamp)}} />
				</div>
				<Shockwave f={f} at={21} x={540} y={860} size={600} width={5} dur={26} />
				<Shockwave f={f} at={24} x={540} y={860} size={760} width={3} color={C.emerald} dur={30} />

				{/* wordmark */}
				<div style={{position: 'absolute', left: 331, top: 382, display: 'flex'}}>
					{letters.map((ch, i) => (
						<RiseWord key={i} f={f} at={46 + i * 2.2} size={150} weight={700} dur={20} tracking={-6}>
							{ch}
						</RiseWord>
					))}
				</div>

				{/* hook */}
				<div style={{position: 'absolute', left: 0, right: 0, top: 640, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
					<RiseWord f={f} at={78} size={92} weight={600} color={C.mutedFg} dur={22}>
						{copy.hook[0]}
					</RiseWord>
					<RiseWord f={f} at={86} size={214} weight={800} dur={22} style={{marginTop: 6}}>
						{copy.hook[1]}
					</RiseWord>
					<div style={{position: 'relative', marginTop: -6}}>
						<div
							style={{
								position: 'absolute',
								left: 30,
								right: 30,
								bottom: 34,
								height: 70,
								borderRadius: 18,
								background: 'linear-gradient(90deg, rgba(16,185,129,0.22), rgba(0,128,153,0.18), rgba(59,130,246,0.2))',
								transform: `scaleX(${tw(f, [104, 128], [0, 1])})`,
								transformOrigin: 'left center',
							}}
						/>
						<RiseWord f={f} at={95} size={250} weight={800} dur={24}>
							<GradientText shift={interpolate(f, [95, 170], [0, 100], clamp)}>{copy.hook[2]}</GradientText>
						</RiseWord>
					</div>
					<div style={{marginTop: 34, fontSize: 48, fontWeight: 500, color: C.ink, letterSpacing: -1, opacity: interpolate(f, [116, 130], [0, 1], clamp), transform: `translateY(${tw(f, [116, 136], [30, 0])}px)`}}>
						{copy.hookSub}
					</div>
				</div>
			</AbsoluteFill>
			{/* seed dot for the next scene */}
			<div style={{position: 'absolute', left: 540 - 22, top: 875 - 22, width: 44, height: 44, borderRadius: 22, background: '#fff', boxShadow: '0 10px 30px rgba(9,9,11,0.18), 0 0 0 2px #e4e4e7', transform: `scale(${tw(f, [164, 178], [0, 1])})`}} />
		</AbsoluteFill>
	);
};
