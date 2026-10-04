import { metricsRunnerContract } from '../ports/__contracts__/metrics-runner.contract.js';

import { InlineMetricsRunner } from './inline-metrics-runner.js';

metricsRunnerContract('InlineMetricsRunner', () => new InlineMetricsRunner());
