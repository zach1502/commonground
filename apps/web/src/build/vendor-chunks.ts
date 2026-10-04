// three.js and React Three Fiber get chunks of their own, so profiles name the real cost and the
// browser cache keeps them across app deploys. Only the 3D views import them, never the entry.
// The post-processing composer is about 110 KB compressed and only the desktop tier draws it, so
// it gets a chunk of its own that the scene loads when the tier asks for it. It comes first,
// because @react-three/postprocessing would otherwise match the r3f prefix.
// React and Vite's preload helper get a chunk of their own too: Rollup otherwise moves them into
// the first manual chunk that reaches them, and the entry would then load all of R3F for them.
const VENDOR_CHUNKS: readonly (readonly [string, string])[] = [
  ['/node_modules/postprocessing/', 'postfx'],
  ['/node_modules/@react-three/postprocessing/', 'postfx'],
  ['/node_modules/n8ao/', 'postfx'],
  ['/node_modules/three/', 'three'],
  ['/node_modules/@react-three/', 'r3f'],
  ['/node_modules/react/', 'react'],
  ['/node_modules/react-dom/', 'react'],
  ['/node_modules/scheduler/', 'react'],
  ['/node_modules/@babel/runtime/', 'react'],
  ['vite/preload-helper', 'react'],
];

/** The vendor chunk a module belongs in, or undefined to let Rollup place it. */
export function vendorChunk(id: string): string | undefined {
  return VENDOR_CHUNKS.find(([path]) => id.includes(path))?.[1];
}
