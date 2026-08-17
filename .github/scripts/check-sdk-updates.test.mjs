import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildIssueBody,
  issueCoversNpm,
  issueCoversUpstream,
  normalizeVersionSpec,
  npmMarker,
  parseIssueLabels,
  upstreamMarker,
} from './check-sdk-updates.mjs';

test('normalizeVersionSpec handles common package.json ranges', () => {
  assert.equal(normalizeVersionSpec('^1.2.13'), '1.2.13');
  assert.equal(normalizeVersionSpec('~0.15.3'), '0.15.3');
  assert.equal(normalizeVersionSpec('workspace:^1.0.2'), '1.0.2');
  assert.equal(normalizeVersionSpec('1.2.3-beta.1'), '1.2.3-beta.1');
  assert.equal(normalizeVersionSpec('latest'), null);
});

test('parseIssueLabels keeps a shared default set and honors env overrides', () => {
  assert.deepEqual(parseIssueLabels('sdk-update, enhancement, release-note '), ['sdk-update', 'enhancement', 'release-note']);
  assert.deepEqual(parseIssueLabels(''), []);
});

test('issueCoversNpm accepts source markers and legacy issue text', () => {
  assert.equal(
    issueCoversNpm(
      [{ title: 'update', body: npmMarker('@microsoft/power-apps', '1.2.13') }],
      '@microsoft/power-apps',
      '1.2.13',
    ),
    true,
  );
  assert.equal(
    issueCoversNpm(
      [{ title: '[sdk-update] @microsoft/power-apps 1.2.13 対応', body: '' }],
      '@microsoft/power-apps',
      '1.2.13',
    ),
    true,
  );
  assert.equal(
    issueCoversNpm(
      [{ title: '[sdk-update] @microsoft/power-apps 1.2.12 対応', body: '' }],
      '@microsoft/power-apps',
      '1.2.13',
    ),
    false,
  );
});

test('issueCoversUpstream accepts markers and linked upstream pull requests', () => {
  const commit = {
    sha: '37d72e4b3043beb9ffd0696bc406a5cfd951da8a',
    message: 'Add mobile sign-out planning guidance (#397)',
    htmlUrl: 'https://github.com/microsoft/power-platform-skills/commit/37d72e4b3043beb9ffd0696bc406a5cfd951da8a',
  };

  assert.equal(
    issueCoversUpstream(
      [{ title: 'mobile', body: 'https://github.com/microsoft/power-platform-skills/pull/397' }],
      'plugins/mobile-apps',
      commit,
    ),
    true,
  );
  assert.equal(
    issueCoversUpstream(
      [{ title: 'mobile', body: upstreamMarker('plugins/mobile-apps', commit.sha) }],
      'plugins/mobile-apps',
      commit,
    ),
    true,
  );
});

test('buildIssueBody includes actionable sections and deduplication markers', () => {
  const npmUpdate = {
    packageName: '@microsoft/power-apps',
    version: '1.2.14',
    publishedAt: '2026-08-17T00:00:00Z',
    url: 'https://www.npmjs.com/package/@microsoft/power-apps/v/1.2.14',
  };
  const upstreamUpdate = {
    sourcePath: 'plugins/code-apps',
    sha: '1234567890abcdef',
    message: 'Update code apps',
    committedAt: '2026-08-17T01:00:00Z',
    htmlUrl: 'https://github.com/microsoft/power-platform-skills/commit/1234567890abcdef',
  };

  const body = buildIssueBody([npmUpdate], [upstreamUpdate], new Date('2026-08-17T02:00:00Z'));

  assert.match(body, /## npm SDK \/ CLI/);
  assert.match(body, /## Microsoft Power Platform Skills/);
  assert.match(body, /## 対応/);
  assert.ok(body.includes(npmMarker(npmUpdate.packageName, npmUpdate.version)));
  assert.ok(body.includes(upstreamMarker(upstreamUpdate.sourcePath, upstreamUpdate.sha)));
});