// The seed logic, with no database or API inside. tools/seed runs it through the API handler.
export {
  loadSeedComments,
  planSeedComments,
  type CommentedDesign,
  type PlannedComment,
  type SeedComment,
} from './comments.js';
export {
  composeBlurb,
  composeTitle,
  fillDetail,
  fragmentBankSchema,
  LEAD_TAGS,
  loadFragmentBank,
  type DesignFacts,
  type FragmentBank,
  type LeadTag,
  type SeedTag,
} from './fragments.js';
export { GENERATED_COUNT, generatedIntents, solveIntent, submittableReport } from './generated.js';
export {
  HEIGHTMAP_REF,
  JONATHAN_ROGERS,
  loadJonathanRogersSite,
  type SeedBlob,
  type SeedSite,
} from './jonathan-rogers.js';
export {
  loadNameLists,
  RESIDENT_COUNT,
  seedPeople,
  type SeedPeople,
  type SeedPersona,
} from './personas.js';
export {
  buildSeedPlan,
  designKey,
  type BuiltDesign,
  type PlannedDesign,
  type SeedPlan,
} from './plan.js';
export { planSelfReports, type PlannedSelfReport } from './self-reports.js';
export { DRAFT_BLURB, isPlaceholder, loadShowcase, type ShowcaseDesign } from './showcase.js';
export {
  runSeed,
  type DesignSubmission,
  type LeaderboardEntry,
  type SeedCounts,
  type SeedGateway,
  type SeededDesign,
  type SeedPhase,
  type SeedProject,
  type SeedSummary,
  type SeedVote,
  type ThumbnailJob,
  type ThumbnailMode,
  type ThumbnailPicture,
  type ThumbnailReport,
  type ThumbnailStep,
} from './seed.js';
export { planVotes, TOP_COUNT, type PlannedVote, type VoteTarget } from './votes.js';
