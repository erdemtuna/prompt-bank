import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';
import { REQUIRED_CI_JOBS } from './lib/githubReadiness';

const workflowSchema = z.object({
  on: z.record(z.string(), z.unknown()),
  permissions: z.record(z.string(), z.string()).optional(),
  concurrency: z.record(z.string(), z.unknown()).optional(),
  jobs: z.record(z.string(), z.record(z.string(), z.unknown()))
});

function readWorkflow(name: string) {
  return workflowSchema.parse(parse(
    readFileSync(resolve('.github', 'workflows', name), 'utf8')
  ));
}

describe('CI workflow contracts', () => {
  it('covers both native filesystem platforms without webview dependencies', () => {
    const workflow = readWorkflow('ci.yml');
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.jobs.verify).toMatchObject({
      name: 'Validate, test, and build',
      'runs-on': 'ubuntu-latest'
    });
    expect(workflow.jobs['rust-core']).toMatchObject({
      name: 'Rust core tests (${{ matrix.name }})',
      'runs-on': '${{ matrix.platform }}',
      strategy: {
        'fail-fast': false,
        matrix: {
          include: [
            { platform: 'ubuntu-latest', name: 'Linux' },
            { platform: 'windows-latest', name: 'Windows' }
          ]
        }
      }
    });
    expect(workflow.jobs['rust-core'].steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uses: 'dtolnay/rust-toolchain@6c977a6ca4077a0ceb28ffbe03f59d46e9ac8772',
        with: { toolchain: '1.94.0' }
      }),
      expect.objectContaining({
        'working-directory': 'src-tauri',
        run: 'cargo test -p prompt-bank-core --locked'
      })
    ]));
    expect(REQUIRED_CI_JOBS).toEqual([
      workflow.jobs.verify.name, 'Rust core tests (Linux)', 'Rust core tests (Windows)'
    ]);
  });

  describe('native cache workflow contracts', () => {
    const matrixSchema = z.object({
      strategy: z.object({
        matrix: z.object({
          include: z.array(z.object({
            platform: z.string(), args: z.string(), name: z.string(), slug: z.string()
          }))
        })
      }),
      steps: z.array(z.object({
        uses: z.string().optional(),
        run: z.string().optional(),
        with: z.record(z.string(), z.unknown()).optional()
      }))
    });

    it('warms only through explicit dispatch on main with read-only access', () => {
      const workflow = readWorkflow('warm-native-cache.yml');
      expect(workflow.on).toEqual({ workflow_dispatch: null });
      expect(workflow.permissions).toEqual({ contents: 'read' });
      expect(workflow.jobs.warm.needs).toBe('validate-ref');
      expect(JSON.stringify(workflow.jobs['validate-ref'])).toContain('refs/heads/main');
      expect(JSON.stringify(workflow)).not.toMatch(/contents":"write|secrets\.|upload-artifact|tauri-action|releaseId/);
      expect(workflow.jobs.warm['timeout-minutes']).toBe(30);
    });

    it('shares target-specific dependency identity without caching application crates', () => {
      const warm = matrixSchema.parse(readWorkflow('warm-native-cache.yml').jobs.warm);
      const release = matrixSchema.parse(readWorkflow('release.yml').jobs.build);
      expect(warm.strategy.matrix.include).toEqual(release.strategy.matrix.include);
      expect(warm.strategy.matrix.include.map((entry) => entry.slug))
        .toEqual(['macos-arm64', 'macos-x64', 'linux', 'windows']);
      for (const job of [warm, release]) {
        expect(job.steps.find((step) => step.uses === 'Swatinem/rust-cache@v2')?.with)
          .toEqual({
            workspaces: 'src-tauri',
            'shared-key': 'desktop-${{ matrix.slug }}',
            'cache-workspace-crates': false
          });
      }
      expect(warm.steps.some((step) => step.run?.includes('--no-bundle --ci')))
        .toBe(true);
      expect(warm.steps.find((step) => step.run?.includes('--no-bundle'))?.run)
        .toContain('-- --locked');
    });

    it('keeps dependency installation and publication barriers intact', () => {
      const release = readWorkflow('release.yml');
      expect(release.jobs['install-dependencies'].permissions).toEqual({ contents: 'read' });
      expect(release.jobs.build.needs).toEqual([
        'validate-release', 'create-release', 'install-dependencies'
      ]);
      expect(release.jobs['publish-release'].needs).toEqual([
        'validate-release', 'create-release', 'build'
      ]);
      expect(release.jobs['publish-release'].if).toContain("needs.build.result == 'success'");
    });
  });

  it('cancels obsolete PR checks but not main or release builds', () => {
    expect(readWorkflow('ci.yml').concurrency).toEqual({
      group: 'ci-${{ github.event.pull_request.number || github.ref }}',
      'cancel-in-progress': "${{ github.event_name == 'pull_request' }}"
    });
    expect(readWorkflow('release.yml').concurrency).toMatchObject({
      'cancel-in-progress': false
    });
  });
});
