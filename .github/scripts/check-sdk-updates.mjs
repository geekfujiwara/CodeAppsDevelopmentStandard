import { execFile } from 'node:child_process';
import { appendFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

export const DEFAULT_ISSUE_LABELS = ['sdk-update', 'enhancement'];

export const NPM_SOURCES = [
  '@microsoft/power-apps',
  '@microsoft/power-apps-cli',
  '@microsoft/power-apps-vite',
  '@microsoft/power-apps-native-host',
  '@microsoft/power-apps-native-offline',
];

export const UPSTREAM_SOURCES = [
  'plugins/code-apps',
  'plugins/mobile-apps',
  'plugins/power-automate',
  'plugins/power-pages',
  'plugins/canvas-apps',
];

const UPSTREAM_REPOSITORY = 'microsoft/power-platform-skills';
const SOURCE_MARKER_PREFIX = 'sdk-update-source';
const execFileAsync = promisify(execFile);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeVersionSpec(spec) {
  if (typeof spec !== 'string') return null;
  const match = spec.trim().match(/^(?:workspace:)?[~^]?([0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?(?:-[0-9A-Za-z.-]+)?)/);
  return match?.[1] ?? null;
}

export function parseIssueLabels(rawLabels) {
  const labels = typeof rawLabels === 'string' ? rawLabels : DEFAULT_ISSUE_LABELS.join(',');
  return labels
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean);
}

export function npmMarker(packageName, version) {
  return `<!-- ${SOURCE_MARKER_PREFIX}:npm:${packageName}@${version} -->`;
}

export function upstreamMarker(sourcePath, sha) {
  return `<!-- ${SOURCE_MARKER_PREFIX}:github:${UPSTREAM_REPOSITORY}:${sourcePath}@${sha} -->`;
}

function issueText(issue) {
  return `${issue.title ?? ''}\n${issue.body ?? ''}`;
}

export function issueCoversNpm(issues, packageName, version) {
  const marker = npmMarker(packageName, version);
  const versionPattern = new RegExp(`(^|[^0-9])${escapeRegExp(version)}([^0-9]|$)`);

  return issues.some((issue) => {
    const text = issueText(issue);
    return text.includes(marker) || (text.includes(packageName) && versionPattern.test(text));
  });
}

export function issueCoversUpstream(issues, sourcePath, commit) {
  const marker = upstreamMarker(sourcePath, commit.sha);
  const shortSha = commit.sha.slice(0, 7);
  const pullRequest = commit.message.match(/\(#(\d+)\)/)?.[1];

  return issues.some((issue) => {
    const text = issueText(issue);
    if (text.includes(marker) || text.includes(commit.htmlUrl) || text.includes(shortSha)) return true;
    return pullRequest ? text.includes(`github.com/microsoft/power-platform-skills/pull/${pullRequest}`) : false;
  });
}

async function fetchJson(url, options = {}, attempts = 2) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'CodeAppsDevelopmentStandard-sdk-update-check',
        ...options.headers,
      },
    });
  } catch (error) {
    if (attempts > 1) return fetchJson(url, options, attempts - 1);
    throw new Error(`Request failed for ${url}: ${error.message}`, { cause: error });
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`${options.method ?? 'GET'} ${url} failed: ${response.status} ${detail}`);
  }

  return response.status === 204 ? null : response.json();
}

async function collectPackageJsonFiles(directory, results = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectPackageJsonFiles(fullPath, results);
    } else if (entry.name === 'package.json') {
      results.push(fullPath);
    }
  }
  return results;
}

export async function discoverLocalVersions(repositoryRoot) {
  const packageFiles = await collectPackageJsonFiles(repositoryRoot);
  const versions = new Map(NPM_SOURCES.map((packageName) => [packageName, new Set()]));

  for (const packageFile of packageFiles) {
    let packageJson;
    try {
      packageJson = JSON.parse(await readFile(packageFile, 'utf8'));
    } catch {
      continue;
    }

    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
      ...packageJson.peerDependencies,
      ...packageJson.optionalDependencies,
    };

    for (const packageName of NPM_SOURCES) {
      const version = normalizeVersionSpec(dependencies[packageName]);
      if (version) versions.get(packageName).add(version);
    }
  }

  return versions;
}

async function getNpmLatest(packageName) {
  const command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', `npm view ${packageName} version time --json`]
    : ['view', packageName, 'version', 'time', '--json'];
  const { stdout } = await execFileAsync(command, args, {
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
    timeout: 60_000,
  });
  const metadata = JSON.parse(stdout);
  const version = metadata.version;
  if (!version) throw new Error(`npm latest tag is missing for ${packageName}`);

  return {
    packageName,
    version,
    publishedAt: metadata.time?.[version] ?? null,
    url: `https://www.npmjs.com/package/${packageName}/v/${version}`,
  };
}

async function getUpstreamLatest(sourcePath) {
  const query = new URLSearchParams({ path: sourcePath, per_page: '1' });
  const headers = {};
  if (process.env.UPSTREAM_GITHUB_TOKEN) {
    headers.Authorization = 'Bearer ' + process.env.UPSTREAM_GITHUB_TOKEN;
  }

  const commits = await fetchJson(
    `https://api.github.com/repos/${UPSTREAM_REPOSITORY}/commits?${query}`,
    { headers },
  );
  const commit = commits[0];
  if (!commit) throw new Error(`No upstream commit found for ${sourcePath}`);

  return {
    sourcePath,
    sha: commit.sha,
    message: commit.commit.message.split('\n')[0].slice(0, 200),
    committedAt: commit.commit.committer.date,
    htmlUrl: commit.html_url,
  };
}

async function getRepositoryIssues(repository, token) {
  const issues = [];
  const headers = token ? { Authorization: 'Bearer ' + token } : {};

  try {
    for (let page = 1; ; page += 1) {
      const pageItems = await fetchJson(
        `https://api.github.com/repos/${repository}/issues?state=all&per_page=100&page=${page}`,
        { headers },
      );
      issues.push(...pageItems.filter((item) => !item.pull_request));
      if (pageItems.length < 100) break;
    }
    return issues;
  } catch (error) {
    if (process.env.DRY_RUN === 'true' || !token) {
      return [];
    }
    throw error;
  }
}

function formatDate(value) {
  return value ? new Date(value).toISOString().replace('.000Z', 'Z') : '不明';
}

export function buildIssueBody(npmUpdates, upstreamUpdates, generatedAt = new Date()) {
  const lines = [
    '## 自動検知',
    '',
    `Weekly SDK update check が ${generatedAt.toISOString()} に未追跡の更新を検知しました。`,
    'この Issue は一次情報の更新検知を目的としており、採用前に破壊的変更・公開 API・CLI help・テンプレート互換性を確認してください。',
    '',
  ];

  if (npmUpdates.length > 0) {
    lines.push('## npm SDK / CLI', '', '| Package | Latest | Published |', '| --- | --- | --- |');
    for (const update of npmUpdates) {
      lines.push(`| [\`${update.packageName}\`](${update.url}) | \`${update.version}\` | ${formatDate(update.publishedAt)} |`);
    }
    lines.push('', '確認コマンド:', '', '```bash');
    for (const update of npmUpdates) {
      lines.push(`npm view ${update.packageName} version time --json`);
    }
    lines.push('```', '');
  }

  if (upstreamUpdates.length > 0) {
    lines.push(
      '## Microsoft Power Platform Skills',
      '',
      'Upstream: https://github.com/microsoft/power-platform-skills',
      '',
      '| Path | Latest commit | Date | Summary |',
      '| --- | --- | --- | --- |',
    );
    for (const update of upstreamUpdates) {
      const summary = update.message.replaceAll('|', '\\|');
      lines.push(`| \`${update.sourcePath}\` | [\`${update.sha.slice(0, 8)}\`](${update.htmlUrl}) | ${formatDate(update.committedAt)} | ${summary} |`);
    }
    lines.push('');
  }

  lines.push(
    '## 対応',
    '',
    '- [ ] npm tarball / upstream commit の差分を確認する',
    '- [ ] 本リポジトリの該当スキル・テンプレート・サンプルへの影響を判定する',
    '- [ ] 必要な実装、リファレンス、troubleshooting、検証を更新する',
    '- [ ] Preview / deprecated / breaking change の境界を明記する',
    '- [ ] 対応不要の場合は理由をコメントして close する',
    '',
    '## 重複防止キー',
    '',
  );

  for (const update of npmUpdates) lines.push(npmMarker(update.packageName, update.version));
  for (const update of upstreamUpdates) lines.push(upstreamMarker(update.sourcePath, update.sha));

  return `${lines.join('\n')}\n`;
}

async function createIssue(repository, token, title, body, labels = DEFAULT_ISSUE_LABELS) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;

  return fetchJson(`https://api.github.com/repos/${repository}/issues`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title, body, labels }),
  });
}

async function writeSummary(lines) {
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`, 'utf8');
  }
}

export async function main() {
  const repository = process.env.ISSUE_REPOSITORY ?? process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '';
  const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
  const issueLabels = parseIssueLabels(process.env.ISSUE_LABELS ?? DEFAULT_ISSUE_LABELS.join(','));

  if (!repository) throw new Error('ISSUE_REPOSITORY or GITHUB_REPOSITORY is required');
  if (!token && !dryRun) throw new Error('GH_TOKEN or GITHUB_TOKEN is required unless dry-run is enabled');

  const issues = await getRepositoryIssues(repository, token || undefined);
  const localVersions = await discoverLocalVersions(process.cwd());
  const npmLatest = [];
  const upstreamLatest = [];

  for (const packageName of NPM_SOURCES) {
    try {
      npmLatest.push(await getNpmLatest(packageName));
    } catch (error) {
      if (!dryRun) throw error;
      console.warn(`Skipping npm registry check for ${packageName}: ${error.message}`);
    }
  }
  for (const sourcePath of UPSTREAM_SOURCES) {
    try {
      upstreamLatest.push(await getUpstreamLatest(sourcePath));
    } catch (error) {
      if (!dryRun) throw error;
      console.warn(`Skipping upstream GitHub check for ${sourcePath}: ${error.message}`);
    }
  }

  const npmUpdates = npmLatest.filter((latest) => {
    const adoptedLocally = localVersions.get(latest.packageName)?.has(latest.version);
    return !adoptedLocally && !issueCoversNpm(issues, latest.packageName, latest.version);
  });
  const upstreamUpdates = upstreamLatest.filter(
    (latest) => !issueCoversUpstream(issues, latest.sourcePath, latest),
  );

  if (npmUpdates.length === 0 && upstreamUpdates.length === 0) {
    await writeSummary(['## SDK update check', '', '未追跡の更新はありません。']);
    return;
  }

  const generatedAt = new Date();
  const title = `[sdk-update] 自動検知: Power Platform SDK / 公式 skills 更新 (${generatedAt.toISOString().slice(0, 10)})`;
  const body = buildIssueBody(npmUpdates, upstreamUpdates, generatedAt);

  if (dryRun) {
    await writeSummary(['## SDK update check (dry run)', '', `作成予定: ${title}`, '', body]);
    return;
  }

  const issue = await createIssue(repository, token || undefined, title, body, issueLabels);
  await writeSummary(['## SDK update check', '', `Issue を作成しました: [#${issue.number}](${issue.html_url})`]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
