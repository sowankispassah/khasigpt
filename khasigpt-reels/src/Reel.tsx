import React from 'react';
import {Audio} from '@remotion/media';
import {AbsoluteFill, Series, staticFile} from 'remotion';
import {S1Hook} from './scenes/S1Hook';
import {S2Chat} from './scenes/S2Chat';
import {S3Voice} from './scenes/S3Voice';
import {S4Image} from './scenes/S4Image';
import {S5Explore} from './scenes/S5Explore';
import {S6Montage} from './scenes/S6Montage';
import {S7Finale} from './scenes/S7Finale';

/** KhasiGPT Instagram Reel · 1080 × 1920 · 60 fps · 45 s. */
export const Reel: React.FC = () => (
	<AbsoluteFill style={{background: '#fff'}}>
		<Audio src={staticFile('reel-soundtrack.wav')} />
		<Series>
			<Series.Sequence name="01 · Logo + hook" durationInFrames={180}>
				<S1Hook />
			</Series.Sequence>
			<Series.Sequence name="02 · Chat in Khasi" durationInFrames={480}>
				<S2Chat />
			</Series.Sequence>
			<Series.Sequence name="03 · Voice chat" durationInFrames={360}>
				<S3Voice />
			</Series.Sequence>
			<Series.Sequence name="04 · Image generation" durationInFrames={480}>
				<S4Image />
			</Series.Sequence>
			<Series.Sequence name="05 · Explore Meghalaya + features" durationInFrames={360}>
				<S5Explore />
			</Series.Sequence>
			<Series.Sequence name="06 · Screen montage" durationInFrames={360}>
				<S6Montage />
			</Series.Sequence>
			<Series.Sequence name="07 · Logo + khasigpt.com" durationInFrames={480}>
				<S7Finale />
			</Series.Sequence>
		</Series>
	</AbsoluteFill>
);
