import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  recreateDraftRelease,
  verifyAndPublishRelease
} = require('./releaseLifecycle.cjs');

const OWNER = 'example';
const REPO = 'prompt-bank';
const RELEASE_ID = 456;
const RELEASE_TAG = 'v0.6.1';
const RELEASE_VERSION = '0.6.1';
const RELEASE_BODY = '# Prompt Bank 0.6.1\r\n\r\nRelease notes.\r\n';
const RELEASE_BODY_SHA256 = createHash('sha256')
  .update('# Prompt Bank 0.6.1\n\nRelease notes.', 'utf8')
  .digest('hex');

describe('release draft recreation', () => {
  it('refuses a published release before deleting or creating anything', async () => {
    const github = mockGithub([
      draft(101),
      { ...draft(102), draft: false }
    ]);

    await expect(recreate(github)).rejects.toThrow(
      'Release 102 for v0.6.1 is already published; refusing to modify it.'
    );
    expect(github.rest.repos.deleteRelease).not.toHaveBeenCalled();
    expect(github.rest.repos.createRelease).not.toHaveBeenCalled();
  });

  it.each([
    ['one', [101]],
    ['multiple', [101, 102, 103]]
  ])('deletes %s stale draft(s) before creating the replacement', async (_label, ids) => {
    const github = mockGithub(ids.map(draft), RELEASE_ID);

    const replacementId = await recreate(github);

    expect(replacementId).toBe(RELEASE_ID);
    expect(github.rest.repos.deleteRelease.mock.calls).toEqual(
      ids.map((releaseId) => [{
        owner: OWNER,
        repo: REPO,
        release_id: releaseId
      }])
    );
    expect(github.rest.repos.createRelease).toHaveBeenCalledWith({
      owner: OWNER,
      repo: REPO,
      tag_name: RELEASE_TAG,
      name: `Prompt Bank ${RELEASE_VERSION}`,
      body: RELEASE_BODY,
      draft: true,
      prerelease: false,
      generate_release_notes: false
    });
    const createOrder = github.rest.repos.createRelease.mock.invocationCallOrder[0];
    expect(github.rest.repos.deleteRelease.mock.invocationCallOrder)
      .toHaveLength(ids.length);
    expect(Math.max(...github.rest.repos.deleteRelease.mock.invocationCallOrder))
      .toBeLessThan(createOrder);
  });

  it('creates directly when no release exists for the tag', async () => {
    const github = mockGithub([
      { ...draft(99), tag_name: 'v0.6.0' }
    ], RELEASE_ID);

    await expect(recreate(github)).resolves.toBe(RELEASE_ID);

    expect(github.rest.repos.deleteRelease).not.toHaveBeenCalled();
    expect(github.rest.repos.createRelease).toHaveBeenCalledOnce();
  });
});

describe('release pre-publication verification', () => {
  it.each([
    ['tag', { tag_name: 'v0.6.0' }, /Draft tag mismatch/],
    ['name', { name: 'Wrong release' }, /Draft name mismatch/],
    ['draft state', { draft: false }, /is not a draft/],
    ['prerelease state', { prerelease: true }, /unexpectedly marked as a prerelease/]
  ])('rejects a %s mismatch without publishing', async (_label, change, error) => {
    const github = mockGithub();
    github.rest.repos.getRelease.mockResolvedValue({
      data: { ...validRelease(), ...change }
    });

    await expect(verify(github)).rejects.toThrow(error);
    expect(github.rest.repos.updateRelease).not.toHaveBeenCalled();
  });

  it('leaves a body-mismatched draft unpublished', async () => {
    const github = mockGithub();
    github.rest.repos.getRelease.mockResolvedValue({
      data: { ...validRelease(), body: `${RELEASE_BODY}unexpected` }
    });

    await expect(verify(github)).rejects.toThrow(
      'Draft body differs from the canonical committed release notes; leaving it unpublished.'
    );
    expect(github.rest.repos.updateRelease).not.toHaveBeenCalled();
  });

  it('publishes a fully verified draft exactly once', async () => {
    const github = mockGithub();
    github.rest.repos.getRelease.mockResolvedValue({ data: validRelease() });

    await verify(github);

    expect(github.rest.repos.getRelease).toHaveBeenCalledWith({
      owner: OWNER,
      repo: REPO,
      release_id: RELEASE_ID
    });
    expect(github.rest.repos.updateRelease).toHaveBeenCalledOnce();
    expect(github.rest.repos.updateRelease).toHaveBeenCalledWith({
      owner: OWNER,
      repo: REPO,
      release_id: RELEASE_ID,
      draft: false,
      make_latest: 'true'
    });
  });
});

function draft(id: number) {
  return {
    id,
    tag_name: RELEASE_TAG,
    draft: true
  };
}

function validRelease() {
  return {
    id: RELEASE_ID,
    tag_name: RELEASE_TAG,
    name: `Prompt Bank ${RELEASE_VERSION}`,
    body: '# Prompt Bank 0.6.1\n\nRelease notes.',
    draft: true,
    prerelease: false
  };
}

function mockGithub(releases: ReturnType<typeof draft>[] = [], replacementId = 999) {
  const listReleases = vi.fn();
  const deleteRelease = vi.fn().mockResolvedValue({});
  const createRelease = vi.fn().mockResolvedValue({
    data: { id: replacementId }
  });
  const getRelease = vi.fn();
  const updateRelease = vi.fn().mockResolvedValue({});
  const paginate = vi.fn().mockResolvedValue(releases);

  return {
    paginate,
    rest: {
      repos: {
        listReleases,
        deleteRelease,
        createRelease,
        getRelease,
        updateRelease
      }
    }
  };
}

function recreate(github: ReturnType<typeof mockGithub>) {
  return recreateDraftRelease({
    github,
    owner: OWNER,
    repo: REPO,
    releaseTag: RELEASE_TAG,
    releaseVersion: RELEASE_VERSION,
    expectedBodySha256: RELEASE_BODY_SHA256,
    readFile: () => RELEASE_BODY
  });
}

function verify(github: ReturnType<typeof mockGithub>) {
  return verifyAndPublishRelease({
    github,
    owner: OWNER,
    repo: REPO,
    releaseId: String(RELEASE_ID),
    releaseTag: RELEASE_TAG,
    releaseVersion: RELEASE_VERSION,
    expectedBodySha256: RELEASE_BODY_SHA256,
    readFile: () => RELEASE_BODY
  });
}
