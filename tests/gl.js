/* One place for the Chromium WebGL setup of every browser suite.
   Default: the real GPU (Direct3D 11 through ANGLE on Windows; the browser default elsewhere). Software GL (SwiftShader) runs at 1-4 fps
   and made the suites non-deterministic, so it is only used when you ask for it: GL=sw npm test.
   After launch, assertGL() prints the WebGL renderer and stops the run if it is SwiftShader while GL is not 'sw'. */
const sw = process.env.GL === 'sw';
const ARGS = sw
  ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  : [...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []), '--enable-gpu', '--ignore-gpu-blocklist'];
async function renderer(browser) {
  const ctx = await browser.newContext(); const p = await ctx.newPage();
  const r = await p.evaluate(() => { const g = document.createElement('canvas').getContext('webgl'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : (g ? 'unknown (no debug info)' : 'no WebGL'); });
  await ctx.close(); return r;
}
async function assertGL(browser) {
  const r = await renderer(browser);
  console.log(`WebGL renderer: ${r} (${sw ? 'software GL requested: GL=sw' : 'hardware GL'})`);
  if (!sw && /swiftshader|software/i.test(r)) {
    console.error('FATAL: the browser fell back to software WebGL (SwiftShader), which makes these suites unreliable. Use a machine with a GPU, or run with GL=sw to accept it.');
    await browser.close(); process.exit(2);
  }
  return r;
}
module.exports = { ARGS, sw, assertGL };
