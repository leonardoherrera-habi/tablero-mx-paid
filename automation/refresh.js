// Refresh local del tablero MX Paid.
//
// Estrategia: Playwright abre BQ Studio Web con sesión persistida (auth-state.json),
// capturamos el Authorization: Bearer token de los requests que hace BQ Studio a
// bigquery.googleapis.com, cerramos el browser, y disparamos la query vía REST API
// con ese token. Procesamos resultados a data.json y hacemos git commit + push.
//
// Modos:
//   node refresh.js --auth    Headed. Te logueas manualmente en BQ Studio y guarda la sesión.
//   node refresh.js --headed  Corrida normal pero con browser visible (debug).
//   node refresh.js           Headless. Modo daily.
//
// Requiere: Node 18+ (fetch nativo), playwright, git configurado en el repo padre.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const QUERY_PATH = path.join(ROOT, 'query.sql');
const DATA_PATH = path.join(ROOT, 'data.json');
const AUTH_STATE = path.join(__dirname, 'auth-state.json');
const PROJECT = 'papyrus-data-mx';
const BQ_STUDIO_URL = `https://console.cloud.google.com/bigquery?project=${PROJECT}`;

const argv = new Set(process.argv.slice(2));
const isAuth = argv.has('--auth');
const isHeaded = argv.has('--headed') || isAuth;

function log(...a) { console.log(`[${new Date().toISOString()}]`, ...a); }

async function waitForEnter(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(prompt, () => { rl.close(); resolve(); }));
}

async function captureTokenViaPlaywright() {
  if (!isAuth && !fs.existsSync(AUTH_STATE)) {
    throw new Error('No existe auth-state.json. Corre primero: npm run auth');
  }

  log('Lanzando Chromium...');
  const browser = await chromium.launch({ headless: !isHeaded });
  const contextOpts = { acceptDownloads: true };
  if (!isAuth && fs.existsSync(AUTH_STATE)) contextOpts.storageState = AUTH_STATE;
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();

  let token = null;
  page.on('request', req => {
    if (token) return;
    const u = req.url();
    if (u.startsWith('https://bigquery.googleapis.com/') ||
        u.startsWith('https://bigquerystorage.googleapis.com/')) {
      const auth = req.headers()['authorization'];
      if (auth && auth.startsWith('Bearer ')) {
        token = auth.slice('Bearer '.length);
      }
    }
  });

  log(`Navegando a BQ Studio (${PROJECT})...`);
  await page.goto(BQ_STUDIO_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  if (isAuth) {
    console.log('\n>>> Loguéate en BQ Studio en la ventana del browser.');
    console.log('>>> Cuando veas el editor SQL cargado, vuelve a esta terminal y presiona ENTER.\n');
    await waitForEnter('Presiona ENTER cuando ya estés logueado: ');
    await context.storageState({ path: AUTH_STATE });
    log(`Sesión guardada en ${AUTH_STATE}`);
    await browser.close();
    return null;
  }

  log('Esperando captura de token OAuth (timeout 60s)...');
  const start = Date.now();
  while (!token && (Date.now() - start) < 60000) {
    await page.waitForTimeout(500);
  }

  await context.storageState({ path: AUTH_STATE });
  await browser.close();

  if (!token) {
    throw new Error('No se capturó access_token. La sesión puede haber expirado. Corre: npm run auth');
  }
  log('Token OAuth capturado');
  return token;
}

async function bqFetch(url, token, init = {}) {
  const headers = Object.assign({ Authorization: `Bearer ${token}` }, init.headers || {});
  const res = await fetch(url, Object.assign({}, init, { headers }));
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    throw new Error(`BQ API ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

async function runQuery(token, sql) {
  log('Enviando job a BigQuery...');
  const submit = await bqFetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT}/jobs`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        configuration: { query: { query: sql, useLegacySql: false } },
      }),
    }
  );
  const jobId = submit.jobReference.jobId;
  const location = submit.jobReference.location;
  log(`Job creado: ${jobId} (${location})`);

  while (true) {
    await new Promise(r => setTimeout(r, 3000));
    const status = await bqFetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT}/jobs/${jobId}?location=${location}`,
      token
    );
    const state = status.status && status.status.state;
    log(`  estado: ${state}`);
    if (state === 'DONE') {
      if (status.status.errorResult) {
        throw new Error(`Job falló: ${JSON.stringify(status.status.errorResult)}`);
      }
      break;
    }
  }

  log('Descargando resultados...');
  const rows = [];
  let schema = null;
  let pageToken = null;
  do {
    const url = new URL(`https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT}/queries/${jobId}`);
    url.searchParams.set('location', location);
    url.searchParams.set('maxResults', '50000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await bqFetch(url.toString(), token);
    schema = schema || page.schema;
    if (page.rows) rows.push(...page.rows);
    pageToken = page.pageToken;
    log(`  acumulado: ${rows.length} filas${pageToken ? ' (más páginas)' : ''}`);
  } while (pageToken);

  const fields = schema.fields.map(f => f.name);
  return rows.map(r => {
    const o = {};
    r.f.forEach((cell, i) => { o[fields[i]] = cell.v; });
    return o;
  });
}

function processRows(raw) {
  return raw.map(r => ({
    d: r.d,
    fid: parseInt(r.fid, 10),
    pl: r.pl || null,
    cmp: r.cmp || null,
    sub: r.sub || null,
    imp: parseInt(r.imp, 10),
    clk: parseInt(r.clk, 10),
    spend: Math.round((parseFloat(r.spend || '0') + Number.EPSILON) * 100) / 100,
    cre: parseInt(r.cre, 10),
    cal: parseInt(r.cal, 10),
    asg: parseInt(r.asg, 10),
    cit: parseInt(r.cit, 10),
    cie: parseInt(r.cie, 10),
  }));
}

function gitCommitPush() {
  const gitOpts = { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] };
  let changed = false;
  try {
    execSync('git diff --quiet data.json', gitOpts);
  } catch {
    changed = true;
  }
  if (!changed) {
    log('No hay cambios en data.json — skip commit');
    return false;
  }
  const date = new Date().toISOString().slice(0, 10);
  execSync('git add data.json', gitOpts);
  execSync(`git commit -m "Auto-refresh data.json ${date}"`, gitOpts);
  execSync('git push', gitOpts);
  log('Cambios pusheados');
  return true;
}

async function main() {
  log('Inicio refresh tablero MX paid');
  const token = await captureTokenViaPlaywright();
  if (!token) return;

  const sql = fs.readFileSync(QUERY_PATH, 'utf-8');
  const raw = await runQuery(token, sql);
  const processed = processRows(raw);

  fs.writeFileSync(DATA_PATH, JSON.stringify(processed));
  const spendRows = processed.filter(r => r.spend > 0 || r.imp > 0).length;
  const leadRows = processed.filter(r => r.cre > 0).length;
  log(`data.json escrito: ${processed.length} filas (spend: ${spendRows}, leads: ${leadRows})`);

  gitCommitPush();
  log('Fin');
}

main().catch(err => {
  console.error('\n[ERROR]', err.message || err);
  process.exit(1);
});
