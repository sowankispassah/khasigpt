/*
 * The "generated" image: a procedural digital painting of a sunset over
 * pine-covered hills and a lake (Umiam Lake mood). Built from layers so the
 * camera can move through it with parallax after the reveal.
 */
import React, {useMemo} from 'react';
import {rand} from '../theme';

const HORIZON = 612;

const ridge = (seed: number, base: number, amp: number, step = 8) => {
	const ph = [rand(seed) * 6.28, rand(seed + 1) * 6.28, rand(seed + 2) * 6.28, rand(seed + 3) * 6.28];
	const pts: [number, number][] = [];
	for (let x = -40; x <= 1040; x += step) {
		const t = x / 1000;
		const y =
			base -
			amp *
				(0.55 * Math.sin(t * 3.1 + ph[0]) +
					0.28 * Math.sin(t * 7.3 + ph[1]) +
					0.12 * Math.sin(t * 17.9 + ph[2]) +
					0.05 * Math.sin(t * 41 + ph[3]));
		pts.push([x, y]);
	}
	return pts;
};

const toPath = (pts: [number, number][], bottom: number) =>
	`M${pts[0][0]},${bottom} ` + pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + ` L${pts[pts.length - 1][0]},${bottom} Z`;

const pine = (x: number, base: number, h: number, w: number) => {
	const tiers = 5;
	const left: string[] = [];
	const right: string[] = [];
	for (let i = 0; i <= tiers; i++) {
		const y = base - h + (h * 0.92 * i) / tiers;
		const out = (w / 2) * (0.25 + (0.75 * i) / tiers);
		const inner = out * 0.55;
		right.push(`${(x + out).toFixed(1)},${(y + h * 0.06).toFixed(1)}`, `${(x + inner).toFixed(1)},${(y + h * 0.04).toFixed(1)}`);
		left.unshift(`${(x - inner).toFixed(1)},${(y + h * 0.04).toFixed(1)}`, `${(x - out).toFixed(1)},${(y + h * 0.06).toFixed(1)}`);
	}
	return `M${x},${base - h} L${right.join(' L')} L${(x + w * 0.04).toFixed(1)},${base} L${(x - w * 0.04).toFixed(1)},${base} L${left.join(' L')} Z`;
};

const ridgeY = (pts: [number, number][], x: number) => {
	const i = Math.max(0, Math.min(pts.length - 1, Math.round((x + 40) / 8)));
	return pts[i][1];
};

type Layer = {d: string; fill: string; mirror?: boolean; depth: number; pines?: string};

const useScene = () =>
	useMemo(() => {
		const specs = [
			{seed: 5, base: 430, amp: 150, top: '#d9a3b5', bottom: '#f5cdb8', depth: 0.1},
			{seed: 11, base: 470, amp: 110, top: '#c58aa7', bottom: '#e9b3a7', depth: 0.15},
			{seed: 23, base: 510, amp: 105, top: '#9d6f9f', bottom: '#d29aa6', depth: 0.25},
			{seed: 37, base: 555, amp: 80, top: '#6f5490', bottom: '#b07d9e', depth: 0.38, pines: 0.55},
			{seed: 41, base: 592, amp: 42, top: '#433d74', bottom: '#7b6192', depth: 0.52, pines: 0.9},
		];
		const layers: Layer[] = specs.map((s, i) => {
			const pts = ridge(s.seed, s.base, s.amp);
			let pines = '';
			if (s.pines) {
				for (let j = 0; j < 90; j++) {
					if (rand(s.seed * 100 + j) > s.pines) continue;
					const x = -20 + j * 11.8 + rand(j + s.seed) * 8;
					const y = ridgeY(pts, x) + 6;
					const h = (10 + rand(j * 3 + s.seed) * 16) * (1 + i * 0.35);
					pines += pine(x, y, h, h * 0.42) + ' ';
				}
			}
			return {d: toPath(pts, HORIZON + 2), fill: `url(#ridge${i})`, mirror: true, depth: s.depth, pines};
		});
		// near shore (below horizon, foreground)
		const shoreL = ridge(77, 905, 26, 10).map(([x, y]) => [x, y + Math.pow(Math.max(0, x - 260) / 140, 2) * 60] as [number, number]);
		const shoreR = ridge(91, 935, 22, 10).map(([x, y]) => [x, y + Math.pow(Math.max(0, 760 - x) / 140, 2) * 60] as [number, number]);
		let bigPines = '';
		const trees = [
			[40, 930, 330],
			[120, 950, 250],
			[205, 985, 300],
			[285, 1010, 190],
			[860, 975, 280],
			[945, 950, 360],
			[770, 1015, 200],
		];
		for (const [x, y, h] of trees) bigPines += pine(x, y, h, h * 0.4) + ' ';
		const reeds: string[] = [];
		for (let j = 0; j < 60; j++) {
			const x = rand(j * 7.1) * 1000;
			const y = 965 + rand(j * 3.3) * 40;
			reeds.push(`M${x.toFixed(1)},${y.toFixed(1)} q${(rand(j) * 10 - 5).toFixed(1)},-20 ${(rand(j + 9) * 14 - 7).toFixed(1)},-${(18 + rand(j + 4) * 26).toFixed(1)}`);
		}
		const birds = new Array(7).fill(0).map((_, j) => ({x: 300 + rand(j * 5.5) * 360, y: 250 + rand(j * 2.2) * 120, s: 6 + rand(j * 1.7) * 7}));
		const glints = new Array(26).fill(0).map((_, j) => ({y: HORIZON + 14 + j * j * 0.62, w: 30 + rand(j * 4.4) * 70 + j * 2.5, x: rand(j * 8.8) * 14 - 7}));
		return {layers, shoreL: toPath(shoreL, 1100), shoreR: toPath(shoreR, 1100), bigPines, reeds: reeds.join(' '), birds, glints};
	}, []);

export const Painting: React.FC<{
	size: number;
	f: number;
	/** camera pan in painting units (-1..1) */
	panX?: number;
	panY?: number;
	zoom?: number;
	style?: React.CSSProperties;
}> = ({size, f, panX = 0, panY = 0, zoom = 1, style}) => {
	const s = useScene();
	const t = f / 60;
	const par = (depth: number) => `translate(${(-panX * 60 * depth).toFixed(2)} ${(-panY * 40 * depth).toFixed(2)}) translate(500 500) scale(${1 + (zoom - 1) * (0.6 + depth)}) translate(-500 -500)`;
	return (
		<svg viewBox="0 0 1000 1000" width={size} height={size} style={{display: 'block', ...style}}>
			<defs>
				<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#262a68" />
					<stop offset="0.28" stopColor="#5b4891" />
					<stop offset="0.48" stopColor="#b5679a" />
					<stop offset="0.66" stopColor="#f28f72" />
					<stop offset="0.8" stopColor="#ffc98f" />
					<stop offset="1" stopColor="#ffe6bd" />
				</linearGradient>
				<linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#f0b48e" />
					<stop offset="0.18" stopColor="#c27792" />
					<stop offset="0.5" stopColor="#5d4a8a" />
					<stop offset="1" stopColor="#1f2153" />
				</linearGradient>
				<radialGradient id="sun" cx="0.6" cy="0.53" r="0.42">
					<stop offset="0" stopColor="#fffbe8" stopOpacity="1" />
					<stop offset="0.08" stopColor="#ffe9b5" stopOpacity="0.95" />
					<stop offset="0.3" stopColor="#ffbe7a" stopOpacity="0.45" />
					<stop offset="1" stopColor="#ff9b6b" stopOpacity="0" />
				</radialGradient>
				{['#dcaabb|#f8d6bf', '#c58aa7|#f2c4b0', '#9d6f9f|#dca5a8', '#6f5490|#b88aa3', '#433d74|#8c6c97'].map((p, i) => {
					const [a, b] = p.split('|');
					return (
						<linearGradient key={i} id={`ridge${i}`} x1="0" y1="0" x2="0" y2="1">
							<stop offset="0" stopColor={a} />
							<stop offset="1" stopColor={b} />
						</linearGradient>
					);
				})}
				<linearGradient id="mist" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#ffd9c2" stopOpacity="0" />
					<stop offset="0.6" stopColor="#ffe1cc" stopOpacity="0.55" />
					<stop offset="1" stopColor="#ffd9c2" stopOpacity="0" />
				</linearGradient>
				<filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
					<feGaussianBlur stdDeviation="6" />
				</filter>
				<filter id="reflect" x="-10%" y="-10%" width="120%" height="120%">
					<feGaussianBlur stdDeviation="1.5 5" />
				</filter>
				<radialGradient id="haze" cx="0.6" cy="0.6" r="0.45">
					<stop offset="0" stopColor="#ffe2b0" stopOpacity="0.7" />
					<stop offset="1" stopColor="#ffb98c" stopOpacity="0" />
				</radialGradient>
				<filter id="grain">
					<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
					<feColorMatrix type="saturate" values="0" />
					<feComponentTransfer>
						<feFuncA type="table" tableValues="0 0.10" />
					</feComponentTransfer>
				</filter>
				<clipPath id="frame">
					<rect width="1000" height="1000" />
				</clipPath>
			</defs>
			<g clipPath="url(#frame)">
				<g transform={par(0.05)}>
					<rect x="-100" y="-100" width="1200" height={HORIZON + 110} fill="url(#sky)" />
					<rect x="-100" y="-100" width="1200" height="1200" fill="url(#sun)" opacity={0.92 + Math.sin(t * 2) * 0.04} />
					<circle cx="600" cy="548" r="44" fill="#fffaf0" />
					{/* clouds */}
					{[0, 1, 2, 3, 4].map((i) => (
						<ellipse
							key={i}
							cx={((150 + i * 230 + t * (6 + i * 2)) % 1300) - 150}
							cy={150 + i * 62}
							rx={210 - i * 14}
							ry={9 + (i % 2) * 5}
							fill={i < 2 ? '#e7a3b5' : '#ffc6a6'}
							opacity={0.55 - i * 0.05}
							filter="url(#soft)"
						/>
					))}
					{s.birds.map((b, i) => (
						<path
							key={i}
							d={`M${b.x + t * 9},${b.y + Math.sin(t * 3 + i) * 3} q${b.s * 0.5},-${b.s * (0.45 + Math.sin(t * 8 + i) * 0.25)} ${b.s},0 q${b.s * 0.5},-${b.s * (0.45 + Math.sin(t * 8 + i) * 0.25)} ${b.s},0`}
							stroke="#3a2c55"
							strokeWidth="2.2"
							fill="none"
							strokeLinecap="round"
						/>
					))}
				</g>
				{/* ridges */}
				{s.layers.map((l, i) => (
					<g key={i} transform={par(l.depth)}>
						<path d={l.d} fill={l.fill} />
						{l.pines ? <path d={l.pines} fill={i === 4 ? '#2f2a5c' : '#5a4682'} /> : null}
						<rect x="-100" y={HORIZON - 70 + i * 4} width="1200" height="90" fill="url(#mist)" opacity={0.5 - i * 0.08} />
					</g>
				))}
				<g transform={par(0.3)} style={{mixBlendMode: 'screen'}}>
					<rect x="-100" y="300" width="1200" height="420" fill="url(#haze)" opacity={0.85} />
				</g>
				{/* water */}
				<g transform={par(0.55)}>
					<rect x="-100" y={HORIZON - 1} width="1200" height="600" fill="url(#water)" />
					{s.layers.map((l, i) => (
						<g key={i} transform={`translate(0 ${HORIZON * 2}) scale(1 -1)`} opacity={0.3 - i * 0.03} filter="url(#reflect)">
							<path d={l.d} fill={i > 2 ? '#2a2558' : '#7d5a8f'} />
						</g>
					))}
					{s.glints.map((g, i) => (
						<rect
							key={i}
							x={600 - g.w / 2 + g.x + Math.sin(t * 2.4 + i * 1.7) * 9}
							y={g.y}
							width={g.w * (0.75 + 0.25 * Math.sin(t * 3 + i))}
							height={2.2 + i * 0.08}
							rx="1.5"
							fill="#fff1cf"
							opacity={0.85 - i * 0.027}
						/>
					))}
					{new Array(16).fill(0).map((_, i) => (
						<rect key={`r${i}`} x={((i * 137 + t * 14) % 1100) - 100} y={HORIZON + 40 + i * 24} width={60 + (i % 4) * 40} height="1.6" fill="#ffd9c0" opacity="0.18" />
					))}
				</g>
				{/* boat */}
				<g transform={`${par(0.62)} translate(${452 + t * 4} ${HORIZON + 92 + Math.sin(t * 1.6) * 1.2})`}>
					<path d="M-34,0 Q0,9 34,0 L28,6 Q0,12 -28,6 Z" fill="#1d1b44" />
					<path d="M6,-2 L6,-26 M6,-26 L-8,4" stroke="#1d1b44" strokeWidth="2.4" strokeLinecap="round" />
					<circle cx="6" cy="-29" r="3.6" fill="#1d1b44" />
					<path d="M-30,10 Q0,15 30,10" stroke="#ffe6c2" strokeWidth="1.4" opacity="0.5" fill="none" />
				</g>
				{/* foreground shores and pines */}
				<g transform={par(0.95)}>
					<path d={s.shoreL} fill="#17173a" />
					<path d={s.shoreR} fill="#17173a" />
					<path d={s.bigPines} fill="#121232" />
					<path d={s.reeds} stroke="#121232" strokeWidth="2.4" fill="none" />
				</g>
				<rect width="1000" height="1000" filter="url(#grain)" />
			</g>
		</svg>
	);
};
