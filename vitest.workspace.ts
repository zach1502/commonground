// Every workspace package owns a vitest.config.ts; the root config runs them as projects.
export const workspaceProjects: readonly string[] = ['packages/*', 'apps/*', 'tools/*'];
