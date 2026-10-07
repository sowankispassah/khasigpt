import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

const weights = [
	['400', 'Geist_400Regular.ttf'],
	['500', 'Geist_500Medium.ttf'],
	['600', 'Geist_600SemiBold.ttf'],
	['700', 'Geist_700Bold.ttf'],
	['800', 'Geist_800ExtraBold.ttf'],
] as const;

/** Geist is the app's font (web: next/font Geist, native: @expo-google-fonts/geist). */
export const loadGeist = () => {
	for (const [weight, file] of weights) {
		void loadFont({family: 'Geist', url: staticFile(`fonts/${file}`), weight});
	}
};
