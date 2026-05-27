// scripts/gen-report.js
// รันทุก Playwright test → สรุปผล → prepend entry ใน PROGRESS.md

const { spawnSync, execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function git(cmd) {
  try { return execSync(`git ${cmd}`, { encoding: 'utf8', cwd: ROOT }).trim(); }
  catch { return ''; }
}

// ── 1. รัน tests ──────────────────────────────────────────────
console.log('\n🧪  Running tests...\n');

const jsonOut = path.join(ROOT, 'test-results', 'results.json');
fs.mkdirSync(path.join(ROOT, 'test-results'), { recursive: true });

// reporters ถูก config ใน playwright.config.js แล้ว (list + html + json file)
const proc = spawnSync(
  'npx', ['playwright', 'test'],
  { cwd: ROOT, shell: true, stdio: 'inherit' }
);

let passed = 0, failed = 0, skipped = 0, duration = '?';
try {
  const json = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
  passed   = json.stats?.expected   ?? 0;
  failed   = json.stats?.unexpected ?? 0;
  skipped  = json.stats?.skipped    ?? 0;
  duration = ((json.stats?.duration ?? 0) / 1000).toFixed(1);
} catch {
  console.warn('\n⚠️  ไม่สามารถ parse ผลการทดสอบได้');
}

const statusIcon = failed > 0 ? '❌' : '✅';
const testSummary = failed > 0
  ? `❌ ${passed} passed, **${failed} FAILED** (${duration}s)`
  : `✅ ${passed}/${passed + failed} passed (${duration}s)`;

// ── 2. Git info ────────────────────────────────────────────────
const commitHash = git('log -1 --format=%h');
const commitMsg  = git('log -1 --format=%s');
const branch     = git('rev-parse --abbrev-ref HEAD');
const recentLog  = git('log --oneline -5');

// ── 3. Timestamp (Bangkok) ────────────────────────────────────
const now = new Date();
const ts  = now.toLocaleString('th-TH', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit',
});

// ── 4. สร้าง section ──────────────────────────────────────────
const logLines = recentLog
  .split('\n')
  .filter(Boolean)
  .map(l => {
    const [hash, ...rest] = l.split(' ');
    return `- \`${hash}\` ${rest.join(' ')}`;
  })
  .join('\n');

const section = [
  `---`,
  ``,
  `## ${statusIcon} ${ts}`,
  ``,
  `| | |`,
  `|---|---|`,
  `| **Commit** | \`${commitHash}\` — ${commitMsg} |`,
  `| **Branch** | \`${branch}\` |`,
  `| **ผลการทดสอบ** | ${testSummary} |`,
  ``,
  `### Commits ล่าสุด`,
  logLines,
  ``,
].join('\n');

// ── 5. Prepend ใน DOC/PROGRESS.md ────────────────────────────
const reportPath = path.join(ROOT, '..', 'DOC', 'PROGRESS.md');
const existing   = fs.existsSync(reportPath)
  ? fs.readFileSync(reportPath, 'utf8')
  : '# PharmBot — รายงานความคืบหน้า\n';

// แยก header (บรรทัดแรก) ออกจาก body
const firstNewline = existing.indexOf('\n');
const header = existing.slice(0, firstNewline + 1);
const body   = existing.slice(firstNewline + 1);

fs.writeFileSync(reportPath, `${header}\n${section}\n${body}`, 'utf8');

console.log(`\n📄  PROGRESS.md updated`);
console.log(`    ${testSummary}`);
console.log(`    Commit: ${commitHash} — ${commitMsg}`);
console.log(`\n💡  ต่อไป: git add PROGRESS.md && git commit -m "report: ..." && git push\n`);

process.exit(failed > 0 ? 1 : 0);
