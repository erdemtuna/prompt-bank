'use strict';

const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');

function canonicalizeReleaseBody(body) {
  const normalized = body.replace(/\r\n?/g, '\n');
  return normalized.endsWith('\n')
    ? normalized.slice(0, -1)
    : normalized;
}

function loadValidatedReleaseBody({
  releaseVersion,
  expectedBodySha256,
  readFile = readFileSync,
}) {
  const releaseBody = readFile(
    `docs/releases/v${releaseVersion}.md`,
    'utf8'
  );
  const canonicalBody = canonicalizeReleaseBody(releaseBody);
  const bodySha256 = createHash('sha256')
    .update(canonicalBody, 'utf8')
    .digest('hex');

  if (bodySha256 !== expectedBodySha256) {
    throw new Error(
      `Committed release body hash ${bodySha256} does not match validated hash ${expectedBodySha256}.`
    );
  }

  return { canonicalBody, releaseBody };
}

async function recreateDraftRelease({
  github,
  owner,
  repo,
  releaseTag,
  releaseVersion,
  expectedBodySha256,
  readFile,
}) {
  const { releaseBody } = loadValidatedReleaseBody({
    releaseVersion,
    expectedBodySha256,
    readFile,
  });
  const releases = await github.paginate(
    github.rest.repos.listReleases,
    {
      owner,
      repo,
      per_page: 100,
    }
  );
  const existing = releases.filter(
    (release) => release.tag_name === releaseTag
  );
  const published = existing.find((release) => !release.draft);

  if (published) {
    throw new Error(
      `Release ${published.id} for ${releaseTag} is already published; refusing to modify it.`
    );
  }

  for (const draft of existing) {
    await github.rest.repos.deleteRelease({
      owner,
      repo,
      release_id: draft.id,
    });
  }

  const { data } = await github.rest.repos.createRelease({
    owner,
    repo,
    tag_name: releaseTag,
    name: `Prompt Bank ${releaseVersion}`,
    body: releaseBody,
    draft: true,
    prerelease: false,
    generate_release_notes: false,
  });

  return data.id;
}

async function verifyAndPublishRelease({
  github,
  owner,
  repo,
  releaseId,
  releaseTag,
  releaseVersion,
  expectedBodySha256,
  readFile,
}) {
  const { canonicalBody } = loadValidatedReleaseBody({
    releaseVersion,
    expectedBodySha256,
    readFile,
  });
  const { data: release } = await github.rest.repos.getRelease({
    owner,
    repo,
    release_id: Number(releaseId),
  });
  const expectedName = `Prompt Bank ${releaseVersion}`;

  if (release.tag_name !== releaseTag) {
    throw new Error(
      `Draft tag mismatch: expected ${releaseTag}, found ${release.tag_name}.`
    );
  }
  if (release.name !== expectedName) {
    throw new Error(
      `Draft name mismatch: expected "${expectedName}", found "${release.name}".`
    );
  }
  if (!release.draft) {
    throw new Error(`Release ${release.id} is not a draft.`);
  }
  if (release.prerelease) {
    throw new Error(`Release ${release.id} is unexpectedly marked as a prerelease.`);
  }
  if (canonicalizeReleaseBody(release.body ?? '') !== canonicalBody) {
    throw new Error(
      'Draft body differs from the canonical committed release notes; leaving it unpublished.'
    );
  }

  await github.rest.repos.updateRelease({
    owner,
    repo,
    release_id: release.id,
    draft: false,
    make_latest: 'true',
  });
}

module.exports = {
  canonicalizeReleaseBody,
  recreateDraftRelease,
  verifyAndPublishRelease,
};
