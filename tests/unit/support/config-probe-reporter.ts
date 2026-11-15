import { writeFileSync } from 'node:fs';
import type { FullConfig, Reporter, Suite } from '@playwright/test/reporter';

/**
 * Test support: dumps the configuration AS RESOLVED BY PLAYWRIGHT (not as
 * written in playwright.config.ts) to the file named by SQAF_PROBE_OUTPUT.
 * Used with `--list`, so no browser is launched and the SUT is not contacted.
 */
export default class ConfigProbeReporter implements Reporter {
  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig, suite: Suite): void {
    const output = process.env['SQAF_PROBE_OUTPUT'];
    if (!output) throw new Error('SQAF_PROBE_OUTPUT is not set');
    const probe = {
      workers: config.workers,
      fullyParallel: config.fullyParallel,
      forbidOnly: config.forbidOnly,
      reporters: config.reporter.map(([name]) => name),
      projects: config.projects.map((project) => ({
        ...project,
        tests: suite.allTests().filter((test) => test.parent.project()?.name === project.name).map((test) => test.title),
      })),
    };
    writeFileSync(output, JSON.stringify(probe, null, 2), 'utf8');
  }
}
