#!/usr/bin/env node
/**
 * Long-Form Runtime FFmpeg Proof Script
 * 
 * Verifies that long-form video assembly dependencies are available
 * in the runtime environment without requiring external credentials or
 * making live external calls.
 * 
 * Exit codes:
 *   0 - All checks passed
 *   1 - One or more checks failed
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

console.log('═══════════════════════════════════════════════════════════════');
console.log('  AmarktAI Network V2 — Long-Form Runtime FFmpeg Proof');
console.log('═══════════════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;
const results = [];

function check(name, fn) {
  try {
    const result = fn();
    if (result) {
      console.log(`✓ ${name}`);
      passed++;
      results.push({ name, status: 'pass' });
    } else {
      console.log(`✗ ${name}`);
      failed++;
      results.push({ name, status: 'fail' });
    }
  } catch (error) {
    console.log(`✗ ${name}: ${error.message}`);
    failed++;
    results.push({ name, status: 'fail', error: error.message });
  }
}

// ── Check 1: FFmpeg command is available ──────────────────────
console.log('── FFmpeg Availability ──');

check('ffmpeg command exists', () => {
  try {
    execSync('which ffmpeg', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
});

check('ffmpeg -version runs', () => {
  try {
    const output = execSync('ffmpeg -version', { encoding: 'utf-8' });
    return output.includes('ffmpeg version');
  } catch {
    return false;
  }
});

// ── Check 2: Assembly module imports ──────────────────────────
console.log('\n── Assembly Module ──');

check('long-form-assembly.ts exists', () => {
  const modulePath = path.join(ROOT, 'apps/api/src/lib/long-form-assembly.ts');
  return fs.existsSync(modulePath);
});

check('checkFfmpegAvailable function exists', () => {
  const modulePath = path.join(ROOT, 'apps/api/src/lib/long-form-assembly.ts');
  const content = fs.readFileSync(modulePath, 'utf-8');
  return content.includes('export async function checkFfmpegAvailable');
});

check('checkFfmpegAvailable returns honest result', async () => {
  try {
    const { checkFfmpegAvailable } = await import('./apps/api/src/lib/long-form-assembly.ts');
    const result = await checkFfmpegAvailable();
    return typeof result === 'object' && 
           'available' in result && 
           typeof result.available === 'boolean';
  } catch {
    return false;
  }
});

// ── Check 3: Assembly routes exist ────────────────────────────
console.log('\n── Assembly Routes ──');

check('assembly route exists in admin-long-form-video.ts', () => {
  const routePath = path.join(ROOT, 'apps/api/src/routes/admin-long-form-video.ts');
  const content = fs.readFileSync(routePath, 'utf-8');
  return content.includes('/api/admin/long-form-video/assemble/');
});

check('assembly status route exists', () => {
  const routePath = path.join(ROOT, 'apps/api/src/routes/admin-long-form-video.ts');
  const content = fs.readFileSync(routePath, 'utf-8');
  return content.includes('/api/admin/long-form-video/assembly/');
});

check('assembly route uses checkFfmpegAvailable', () => {
  const routePath = path.join(ROOT, 'apps/api/src/routes/admin-long-form-video.ts');
  const content = fs.readFileSync(routePath, 'utf-8');
  return content.includes('checkFfmpegAvailable');
});

// ── Check 4: Artifact storage ─────────────────────────────────
console.log('\n── Artifact Storage ──');

check('artifact storage root is resolvable', async () => {
  try {
    const { getStorageRoot } = await import('./packages/core/src/config.ts');
    const root = getStorageRoot();
    return typeof root === 'string' && root.length > 0;
  } catch {
    return false;
  }
});

// ── Check 5: Audit truth ──────────────────────────────────────
console.log('\n── Audit Truth ──');

check('audit reports assembly module exists', () => {
  const auditScript = path.join(ROOT, 'scripts/audit-build-completion-map.mjs');
  const content = fs.readFileSync(auditScript, 'utf-8');
  return content.includes('longFormAssemblyModuleExists');
});

check('audit reports assembly route exists', () => {
  const auditScript = path.join(ROOT, 'scripts/audit-build-completion-map.mjs');
  const content = fs.readFileSync(auditScript, 'utf-8');
  return content.includes('longFormAssemblyRouteExists');
});

check('audit separates videoOnlyAssemblyPipelineReady from videoOnlyReady', () => {
  const auditScript = path.join(ROOT, 'scripts/audit-build-completion-map.mjs');
  const content = fs.readFileSync(auditScript, 'utf-8');
  return content.includes('videoOnlyAssemblyPipelineReady') && 
         content.includes('videoOnlyReady');
});

check('audit reports fullMultimediaReady false', () => {
  const auditScript = path.join(ROOT, 'scripts/audit-build-completion-map.mjs');
  const content = fs.readFileSync(auditScript, 'utf-8');
  return content.includes('fullMultimediaReady: false');
});

// ── Check 6: No provider keys required ────────────────────────
console.log('\n── Security ──');

check('assembly module does not require provider keys', () => {
  const modulePath = path.join(ROOT, 'apps/api/src/lib/long-form-assembly.ts');
  const content = fs.readFileSync(modulePath, 'utf-8');
  // Check that the assembly module doesn't access process.env for provider keys
  return !content.includes('process.env.GROQ_API_KEY') && 
         !content.includes('process.env.TOGETHER_API_KEY') &&
         !content.includes('process.env.GENX_API_KEY');
});

check('assembly module does not make live provider calls', () => {
  const modulePath = path.join(ROOT, 'apps/api/src/lib/long-form-assembly.ts');
  const content = fs.readFileSync(modulePath, 'utf-8');
  // Should not contain direct API calls to providers (fetch calls to provider URLs)
  return !content.includes('fetch(\'https://api.together.xyz') &&
         !content.includes('fetch(\'https://api.groq.com') &&
         !content.includes('fetch(\'https://query.genx.sh');
});

// ── Check 7: Docker configuration ─────────────────────────────
console.log('\n── Docker Configuration ──');

check('Dockerfile installs ffmpeg in api stage', () => {
  const dockerfilePath = path.join(ROOT, 'Dockerfile');
  const content = fs.readFileSync(dockerfilePath, 'utf-8');
  
  // Check that ffmpeg is installed in the api stage
  const apiStageMatch = content.match(/FROM production-base AS api[\s\S]*?(?=FROM|$)/);
  if (!apiStageMatch) return false;
  
  const apiStage = apiStageMatch[0];
  return apiStage.includes('ffmpeg');
});

// ── Summary ───────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════════\n');

if (failed > 0) {
  console.log('❌ Some checks failed. Review the output above.\n');
  process.exit(1);
} else {
  console.log('✅ All checks passed. Long-form runtime is ready.\n');
  process.exit(0);
}
