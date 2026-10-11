const path = require('node:path');
const {bundle} = require('@remotion/bundler');
const {openBrowser, selectComposition, renderStill} = require('@remotion/renderer');

(async () => {
  const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts'), outDir: path.resolve('out/review-bundle')});
  const browser = await openBrowser('chrome', {
    browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || undefined,
  });
  const composition = await selectComposition({serveUrl, id: 'KhasiGPTWhiteMotion', puppeteerInstance: browser});
  const frames = process.argv.slice(2).map(Number);
  for (const frame of frames.length ? frames : [38,132,179,244,325,398,521,591,657,826,909,981,1089,1190,1260,1300,1410]) {
    await renderStill({serveUrl,composition,frame,imageFormat:'png',scale:.5,output:path.resolve(`out/review-${frame}.png`),puppeteerInstance:browser,onBrowserLog:log=>console.log(log.text)});
    console.log(`Reviewed frame ${frame}`);
  }
  await browser.close({silent:true});
})().catch(error => {console.error(error);process.exitCode=1;});
