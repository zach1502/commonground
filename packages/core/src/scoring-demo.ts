// This entry only wires console output to runScoringDemo, which is tested directly.
import { runScoringDemo } from './scoring/demo.js';

runScoringDemo((line) => {
  console.log(line);
});
