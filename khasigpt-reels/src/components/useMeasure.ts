import {useLayoutEffect, useRef, useState} from 'react';
import {continueRender, delayRender} from 'remotion';

/** Measures an element's height once fonts are ready (blocks the render until then). */
export const useMeasuredHeight = (fallback: number) => {
	const ref = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState(fallback);
	const [handle] = useState(() => delayRender('Measure layout after fonts load'));
	useLayoutEffect(() => {
		let alive = true;
		const measure = () => {
			if (alive && ref.current) setHeight(ref.current.offsetHeight);
		};
		void document.fonts.ready.then(() => {
			measure();
			requestAnimationFrame(() => continueRender(handle));
		});
		return () => {
			alive = false;
			continueRender(handle);
		};
	}, [handle]);
	return [ref, height] as const;
};
