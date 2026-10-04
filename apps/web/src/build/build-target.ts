import browserslistToEsbuild from 'browserslist-to-esbuild';

/**
 * The esbuild targets for the browsers README.md "Browser support" names. The list lives in the
 * root package.json, so pass the repo root and every tool in the repo reads the one list.
 */
export function buildTarget(repoRoot: string): string[] {
  return browserslistToEsbuild(undefined, { path: repoRoot });
}
