export const PATHS = {
  home: '/',
  login: '/login',
  staffLogin: '/staff/login',
  selfReport: '/self-report',
  projects: '/projects',
  project: (id: string) => `/projects/${encodeURIComponent(id)}`,
  gallery: (id: string) => `/projects/${encodeURIComponent(id)}/designs`,
  vote: (id: string) => `/projects/${encodeURIComponent(id)}/vote`,
  leaderboard: (id: string) => `/projects/${encodeURIComponent(id)}/leaderboard`,
  designView: (id: string) => `/designs/${encodeURIComponent(id)}`,
  review: (id: string) => `/designs/${encodeURIComponent(id)}/review`,
  newDesign: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/design/new`,
  describe: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/design/describe`,
  describePreview: (projectId: string, designId: string) =>
    `/projects/${encodeURIComponent(projectId)}/design/describe/${encodeURIComponent(designId)}`,
  design: (projectId: string, designId: string) =>
    `/projects/${encodeURIComponent(projectId)}/design/${encodeURIComponent(designId)}`,
  staff: '/staff',
  insights: (id: string) => `/staff/projects/${encodeURIComponent(id)}/insights`,
  styleguide: '/styleguide',
  logout: '/logout',
} as const;
