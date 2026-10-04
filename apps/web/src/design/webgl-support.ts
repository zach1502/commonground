/**
 * Whether the browser can open a WebGL2 context, which the 3D views need. It checks for the
 * WebGL2 type first, so a browser or test page without it never builds a canvas, and it gives
 * the probe context back at once, since a page may hold only a few.
 */
export function webGl2Support(): 'available' | 'missing' {
  if (typeof globalThis.WebGL2RenderingContext === 'undefined') return 'missing';
  const context = document.createElement('canvas').getContext('webgl2');
  if (context === null) return 'missing';
  context.getExtension('WEBGL_lose_context')?.loseContext();
  return 'available';
}
