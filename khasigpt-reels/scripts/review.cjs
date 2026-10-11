// Render review stills: node scripts/review.cjs <compositionId> <frame> [frame...]
const path = require('node:path');
const fs = require('node:fs');
const {bundle} = require('@remotion/bundler');
const {openBrowser, selectComposition, renderStill} = require('@remotion/renderer');

(async () => {
	const [id, ...rest] = process.argv.slice(2);
	const frames = rest.map(Number);
	const outDir = path.resolve('out/review');
	fs.mkdirSync(outDir, {recursive: true});
	const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts'), outDir: path.resolve('out/review-bundle'), rspack: true});
	const browser = await openBrowser('chrome');
	const composition = await selectComposition({serveUrl, id, puppeteerInstance: browser});
	for (const frame of frames) {
		await renderStill({serveUrl, composition, frame, imageFormat: 'jpeg', jpegQuality: 88, scale: 0.4, output: path.join(outDir, `${id}-${frame}.jpg`), puppeteerInstance: browser, onBrowserLog: (l) => l.type === 'error' && console.log(l.text)});
		process.stdout.write(`${frame} `);
	}
	await browser.close({silent: true});
	console.log('done');
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
