import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policyPath = path.join(root, '.github/community-issue-policy.json');
const marker = '<!-- community-issue-agent:acknowledged -->';
const decisions = new Set(['AUTO_PR', 'NEEDS_INFO', 'OWNER_REVIEW', 'NO_CHANGE', 'REJECTED_INPUT']);

export function buildAcknowledgement() {
  return `${marker}\nご報告・ご提案ありがとうございます。背景や経緯も含めて共有いただいた内容を確認します。\n\n既存の設計方針、コード、テストへの影響を GitHub Actions の隔離環境でレビューし、再現可能な低リスクの変更は推奨 Draft PR として提示します。方針判断が必要な場合は、@geekfujiwara に確認したうえで対応します。\n\nThank you for the report and for sharing the context. We will review it against the existing design, code, and tests in an isolated GitHub Actions environment. Reproducible low-risk changes may be proposed as a draft pull request; policy decisions will be referred to @geekfujiwara.`;
}

function isSafeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) return false;
  const normalized = value.replaceAll('\\', '/');
  return !path.posix.isAbsolute(normalized)
    && !normalized.split('/').includes('..')
    && !/^[A-Za-z]:/.test(normalized)
    && !normalized.startsWith('.git/');
}

export function validateSandboxCommand(command) {
  if (!command || !Array.isArray(command.argv) || command.argv.some((item) => typeof item !== 'string')) {
    return { valid: false, reason: 'argv must be an array of strings' };
  }
  if (command.argv.length < 2 || command.argv.length > 20) {
    return { valid: false, reason: 'argv length is outside the allowed range' };
  }
  if (command.argv.some((item) => /[\r\n\0]/.test(item))) {
    return { valid: false, reason: 'control characters are not allowed' };
  }

  const [executable, ...args] = command.argv;
  if (executable === 'node' && args[0] === '--test') {
    const targets = args.slice(1);
    const validTargets = targets.length > 0 && targets.every((target) =>
      isSafeRelativePath(target)
      && (/\.test\.mjs$/.test(target) || target.startsWith('.agent/repro/'))
    );
    return validTargets ? { valid: true, runtime: 'node' } : { valid: false, reason: 'node targets are not allowed' };
  }

  if (executable === 'python' && args[0] === '-m' && args[1] === 'unittest') {
    const targets = args.slice(2);
    const validTargets = targets.length > 0 && targets.every(isSafeRelativePath);
    return validTargets ? { valid: true, runtime: 'python' } : { valid: false, reason: 'python targets are not allowed' };
  }

  if (executable === 'python' && args[0] === '-c' && args.length === 2) {
    const diagnostic = args[1];
    const allowed = diagnostic.length > 0 && diagnostic.length <= 4000 && !/[\r\n\0]/.test(diagnostic);
    return allowed ? { valid: true, runtime: 'python' } : { valid: false, reason: 'python diagnostic is not allowed' };
  }

  if (executable === 'python' && args.length === 1 && isSafeRelativePath(args[0])) {
    const target = args[0].replaceAll('\\', '/');
    const allowed = /(^|\/)(test_[^/]+|validate_[^/]+)\.py$/.test(target) || target.startsWith('.agent/repro/');
    return allowed ? { valid: true, runtime: 'python' } : { valid: false, reason: 'python script is not a test or validator' };
  }

  return { valid: false, reason: `executable or arguments are not allowed: ${executable}` };
}

export function validatePlan(plan, policy, validationMode = false) {
  if (!plan || !Array.isArray(plan.commands)) throw new Error('Plan must contain a commands array.');
  if (plan.commands.length === 0 || plan.commands.length > policy.sandbox.maximumCommands) {
    throw new Error(`Plan must contain 1-${policy.sandbox.maximumCommands} commands.`);
  }
  return plan.commands.map((command, index) => {
    const validation = validateSandboxCommand(command);
    if (!validation.valid) throw new Error(`Command ${index + 1} rejected: ${validation.reason}`);
    const expectedExitCode = command.expectedExitCode ?? 0;
    if (![0, 1].includes(expectedExitCode)) throw new Error(`Command ${index + 1} has an invalid expected exit code.`);
    if (validationMode && expectedExitCode !== 0) {
      throw new Error(`Command ${index + 1} must expect exit code 0 during post-change validation.`);
    }
    return { ...command, expectedExitCode, runtime: validation.runtime };
  });
}

export function parseJsonDocument(value) {
  const trimmed = String(value ?? '').trim();
  try {
    return JSON.parse(trimmed);
  } catch (directError) {
    const fenced = [...trimmed.matchAll(/```json\s*\r?\n([\s\S]*?)\r?\n```/gi)];
    if (fenced.length !== 1) throw directError;
    return JSON.parse(fenced[0][1]);
  }
}

export function normalizeDecision(rawDecision, policy, reproductionPassed) {
  const decision = decisions.has(rawDecision?.decision) ? rawDecision.decision : 'OWNER_REVIEW';
  const confidence = Number.isFinite(rawDecision?.confidence) ? rawDecision.confidence : 0;
  let normalized = decision;
  let reason = String(rawDecision?.reason ?? 'AI decision was incomplete.').slice(0, 2000);

  if (normalized === 'AUTO_PR' && (!reproductionPassed || confidence < policy.minimumAutoPrConfidence)) {
    normalized = 'OWNER_REVIEW';
    reason = `Automatic PR threshold was not met. ${reason}`;
  }

  return {
    decision: normalized,
    confidence: Math.max(0, Math.min(1, confidence)),
    reason,
    question: String(rawDecision?.question ?? '').slice(0, 2000),
    proposedTitle: String(rawDecision?.proposedTitle ?? '').replace(/[\r\n]/g, ' ').slice(0, 120),
  };
}

export function validateChangedPaths(files, policy) {
  if (files.length === 0) throw new Error('No tracked changes were produced.');
  if (files.length > policy.maximumChangedFiles) throw new Error('Changed file count exceeds policy.');
  for (const file of files) {
    const normalized = file.replaceAll('\\', '/');
    if (!isSafeRelativePath(normalized)) throw new Error(`Unsafe changed path: ${file}`);
    if (policy.forbiddenChangePrefixes.some((prefix) => normalized.startsWith(prefix))) {
      throw new Error(`Forbidden changed path: ${file}`);
    }
    const allowed = policy.allowedChangePrefixes.some((prefix) =>
      prefix.endsWith('/') ? normalized.startsWith(prefix) : normalized === prefix
    );
    if (!allowed) {
      throw new Error(`Changed path is outside the allowlist: ${file}`);
    }
  }
}

async function loadPolicy() {
  return JSON.parse(await readFile(policyPath, 'utf8'));
}

async function githubRequest(endpoint, options = {}) {
  const token = process.env.GH_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) throw new Error('GH_TOKEN and GITHUB_REPOSITORY are required.');
  const response = await fetch(`https://api.github.com/repos/${repository}${endpoint}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${endpoint} failed: ${response.status} ${(await response.text()).slice(0, 500)}`);
  return response.status === 204 ? null : response.json();
}

async function ensureLabel(name, color, description) {
  const encoded = encodeURIComponent(name);
  const existing = await githubRequest(`/labels/${encoded}`).catch((error) => {
    if (String(error).includes('failed: 404')) return null;
    throw error;
  });
  if (!existing) {
    await githubRequest('/labels', { method: 'POST', body: JSON.stringify({ name, color, description }) });
  }
}

async function addLabels(issueNumber, labels) {
  for (const label of labels) await ensureLabel(label.name, label.color, label.description);
  await githubRequest(`/issues/${issueNumber}/labels`, {
    method: 'POST',
    body: JSON.stringify({ labels: labels.map((label) => label.name) }),
  });
}

async function acknowledge(issueNumber) {
  const comments = await githubRequest(`/issues/${issueNumber}/comments?per_page=100`);
  if (!comments.some((comment) => comment.body?.includes(marker))) {
    await githubRequest(`/issues/${issueNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: buildAcknowledgement() }),
    });
  }
  await addLabels(issueNumber, [
    { name: 'status:acknowledged', color: '1f883d', description: 'Community issue acknowledged' },
    { name: 'agent:reviewing', color: '0969da', description: 'Autonomous review in progress' },
  ]);
}

async function prepare(issueNumber) {
  const policy = await loadPolicy();
  const issue = await githubRequest(`/issues/${issueNumber}`);
  const safeIssue = {
    number: issue.number,
    title: String(issue.title ?? '').slice(0, 500),
    body: String(issue.body ?? '').slice(0, policy.maximumIssueCharacters),
    author: issue.user?.login ?? 'unknown',
    authorAssociation: issue.author_association ?? 'NONE',
    labels: (issue.labels ?? []).map((label) => label.name),
  };
  await mkdir(path.join(root, '.agent'), { recursive: true });
  await writeFile(path.join(root, '.agent/issue.json'), `${JSON.stringify(safeIssue, null, 2)}\n`);
}

async function validatePlanFile(file, mode) {
  const policy = await loadPolicy();
  const plan = parseJsonDocument(await readFile(path.resolve(root, file), 'utf8'));
  const commands = validatePlan(plan, policy, mode === 'validation');
  await writeFile(path.join(root, '.agent/validated-plan.json'), `${JSON.stringify({ commands }, null, 2)}\n`);
}

async function runPlan(outputFile = '.agent/reproduction-report.json') {
  const policy = await loadPolicy();
  const plan = JSON.parse(await readFile(path.join(root, '.agent/validated-plan.json'), 'utf8'));
  const results = [];
  for (const command of plan.commands) {
    const image = command.runtime === 'node' ? policy.sandbox.nodeImage : policy.sandbox.pythonImage;
    const result = spawnSync('docker', [
      'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--pids-limit', '256', '--memory', '1g', '--cpus', '2',
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', '-v', `${root}:/workspace:ro`, '-w', '/workspace',
      image, ...command.argv,
    ], { encoding: 'utf8', timeout: policy.sandbox.timeoutMilliseconds, maxBuffer: 2 * 1024 * 1024 });
    results.push({
      argv: command.argv,
      exitCode: result.status,
      signal: result.signal,
      stdout: String(result.stdout ?? '').slice(-policy.sandbox.maximumOutputCharacters),
      stderr: String(result.stderr ?? '').slice(-policy.sandbox.maximumOutputCharacters),
      expectedExitCode: command.expectedExitCode,
      passed: result.status === command.expectedExitCode,
    });
  }
  const report = { passed: results.every((result) => result.passed), results };
  await writeFile(path.resolve(root, outputFile), `${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 2;
}

async function validateDecision(file) {
  const policy = await loadPolicy();
  const report = JSON.parse(await readFile(path.join(root, '.agent/reproduction-report.json'), 'utf8'));
  const raw = parseJsonDocument(await readFile(path.resolve(root, file), 'utf8'));
  const decision = normalizeDecision(raw, policy, report.passed);
  await writeFile(path.join(root, '.agent/validated-decision.json'), `${JSON.stringify(decision, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) {
    await writeFile(process.env.GITHUB_OUTPUT, `decision=${decision.decision}\n`, { flag: 'a' });
  }
}

async function validateDiff() {
  const policy = await loadPolicy();
  const destructiveOutput = execFileSync('git', ['diff', '--name-only', '--diff-filter=DR', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (destructiveOutput.trim()) throw new Error('File deletion and rename are not allowed for autonomous changes.');
  const trackedOutput = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACM', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const untrackedOutput = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
  const trackedFiles = trackedOutput.split(/\r?\n/).filter(Boolean);
  const untrackedFiles = untrackedOutput.split(/\r?\n/).filter((file) => file && !file.startsWith('.agent/'));
  const files = [...new Set([...trackedFiles, ...untrackedFiles])];
  validateChangedPaths(files, policy);
  const numstat = execFileSync('git', ['diff', '--numstat', 'HEAD'], { cwd: root, encoding: 'utf8' });
  let changedLines = 0;
  for (const line of numstat.split(/\r?\n/).filter(Boolean)) {
    const [added, deleted] = line.split('\t');
    if (added === '-' || deleted === '-') throw new Error('Binary changes are not allowed.');
    changedLines += Number(added) + Number(deleted);
  }
  for (const file of untrackedFiles) {
    const contents = await readFile(path.join(root, file));
    if (contents.includes(0)) throw new Error(`Binary changes are not allowed: ${file}`);
    changedLines += contents.toString('utf8').split(/\r?\n/).length;
  }
  if (changedLines > policy.maximumChangedLines) throw new Error('Changed line count exceeds policy.');
}

async function removeLabel(issueNumber, name) {
  await githubRequest(`/issues/${issueNumber}/labels/${encodeURIComponent(name)}`, { method: 'DELETE' }).catch((error) => {
    if (!String(error).includes('failed: 404')) throw error;
  });
}

async function finalizeReview(issueNumber) {
  const decision = JSON.parse(await readFile(path.join(root, '.agent/validated-decision.json'), 'utf8'));
  const names = {
    AUTO_PR: ['decision:auto-pr', '0e8a16', 'Eligible for an autonomous draft pull request'],
    NEEDS_INFO: ['decision:needs-info', 'fbca04', 'More information is required'],
    OWNER_REVIEW: ['decision:owner-review', 'd93f0b', 'Repository owner decision is required'],
    NO_CHANGE: ['decision:no-change', 'cfd3d7', 'No repository change is recommended'],
    REJECTED_INPUT: ['decision:rejected-input', 'b60205', 'Input was rejected by the safety policy'],
  };
  const [name, color, description] = names[decision.decision];
  for (const [otherDecision, [otherName]] of Object.entries(names)) {
    if (otherDecision !== decision.decision) await removeLabel(issueNumber, otherName);
  }
  await addLabels(issueNumber, [{ name, color, description }]);
  await removeLabel(issueNumber, 'agent:reviewing');
  if (decision.decision === 'NEEDS_INFO' || decision.decision === 'OWNER_REVIEW' || decision.decision === 'REJECTED_INPUT') {
    await githubRequest(`/issues/${issueNumber}/assignees`, {
      method: 'POST',
      body: JSON.stringify({ assignees: ['geekfujiwara'] }),
    });
  }
}

async function fallbackDecision(reason) {
  await mkdir(path.join(root, '.agent'), { recursive: true });
  const decision = { decision: 'OWNER_REVIEW', confidence: 0, reason, question: '', proposedTitle: '' };
  await writeFile(path.join(root, '.agent/reproduction-report.json'), `${JSON.stringify({ passed: false, results: [] }, null, 2)}\n`);
  await writeFile(path.join(root, '.agent/decision.json'), `${JSON.stringify(decision, null, 2)}\n`);
}

async function buildPrBody(issueNumber) {
  const decision = JSON.parse(await readFile(path.join(root, '.agent/validated-decision.json'), 'utf8'));
  const report = JSON.parse(await readFile(path.join(root, '.agent/validation-report.json'), 'utf8'));
  const files = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean);
  const commands = report.results.map((result) => `- \`${result.argv.join(' ')}\`: ${result.passed ? 'PASS' : 'FAIL'}`);
  const body = [
    '## Summary', '', decision.reason, '',
    '## Changed files', '', ...files.map((file) => `- \`${file}\``), '',
    '## Sandbox validation', '', ...commands, '',
    'The validation commands ran without repository secrets in a network-disabled, read-only container.', '',
    `Closes #${issueNumber}`, '',
    '<!-- community-issue-agent:generated-pr -->',
  ].join('\n');
  await writeFile(path.join(root, '.agent/pr-body.md'), `${body}\n`);
}

async function completePr(issueNumber, prUrl) {
  await addLabels(issueNumber, [
    { name: 'agent:pr-opened', color: '8250df', description: 'Autonomous draft pull request opened' },
  ]);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(process.env.GITHUB_STEP_SUMMARY, `Draft pull request: ${prUrl}\n`, { flag: 'a' });
  }
}

async function escalate(issueNumber, reason) {
  await addLabels(issueNumber, [
    { name: 'decision:owner-review', color: 'd93f0b', description: 'Repository owner decision is required' },
  ]);
  await githubRequest(`/issues/${issueNumber}/assignees`, {
    method: 'POST',
    body: JSON.stringify({ assignees: ['geekfujiwara'] }),
  });
  await removeLabel(issueNumber, 'agent:reviewing');
  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(process.env.GITHUB_STEP_SUMMARY, `Owner review required: ${String(reason).slice(0, 2000)}\n`, { flag: 'a' });
  }
}

async function main() {
  const [command, argument, secondArgument] = process.argv.slice(2);
  if (command === 'acknowledge') return acknowledge(Number(argument));
  if (command === 'prepare') return prepare(Number(argument));
  if (command === 'validate-plan') return validatePlanFile(argument, secondArgument);
  if (command === 'run-plan') return runPlan(argument);
  if (command === 'validate-decision') return validateDecision(argument);
  if (command === 'validate-diff') return validateDiff();
  if (command === 'finalize-review') return finalizeReview(Number(argument));
  if (command === 'fallback-decision') return fallbackDecision(argument);
  if (command === 'build-pr-body') return buildPrBody(Number(argument));
  if (command === 'complete-pr') return completePr(Number(argument), secondArgument);
  if (command === 'escalate') return escalate(Number(argument), secondArgument);
  throw new Error('Unknown community issue agent command.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}