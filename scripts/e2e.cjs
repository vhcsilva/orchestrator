// E2E (Linux/macOS): abre o app Electron real, sem WSL, com Claude Code e kiro-cli falsos
// (tests/fakes) e percorre o fluxo completo pela interface, salvando capturas em out/e2e-shots.
// No Linux sem tela: xvfb-run -a npm run e2e
const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')
const { _electron } = require('playwright-core')

const APP = path.resolve(__dirname, '..')
const root = path.join(require('os').tmpdir(), 'orq-e2e')
const home = path.join(root, 'home')
const data = path.join(home, '.orquestrador')
const shots = path.join(APP, 'out', 'e2e-shots')

fs.rmSync(root, { recursive: true, force: true })
fs.rmSync(shots, { recursive: true, force: true })
fs.mkdirSync(shots, { recursive: true })
fs.mkdirSync(data, { recursive: true })
const env = { ...process.env, HOME: home, FAKE_LOG: path.join(root, 'calls.jsonl'), GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
fs.writeFileSync(env.FAKE_LOG, '')
const origin = path.join(root, 'origin.git')
const src = path.join(home, 'repos', 'repo-a')
execSync(`git init -q --bare -b main ${origin} && git init -q -b main ${src}`, { env })
execSync(`echo hi > README.md && git add . && git commit -q -m init && git remote add origin ${origin} && git push -q origin main`, { cwd: src, env })
fs.writeFileSync(path.join(data, 'config.json'), JSON.stringify({
  wsl: { enabled: false, distro: '', shellInit: `export PATH="${APP}/tests/fakes:$PATH"` },
  repos: [{ name: 'repo-a', path: '~/repos/repo-a', baseBranch: 'main', defaultScope: 'a' }],
  ide: { openCommand: 'true', runIn: 'host', generateSteering: true },
  execution: { notifications: false, pauseOnUserChanges: true, storyCheckMinutes: 0, autoOndeParei: false }
}))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const app = await _electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', path.join(APP, 'out/main/index.js')], env, cwd: APP })
  const page = await app.firstWindow()
  page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text()) })
  page.on('pageerror', (e) => console.log('page error:', e.message))
  await page.setViewportSize({ width: 1440, height: 900 })
  const shot = async (name) => { await sleep(400); await page.screenshot({ path: `${shots}/${name}.png` }); console.log('shot', name) }

  await page.waitForSelector('text=Board')
  await shot('01-board-vazio')

  await page.click('button[aria-label="Configurações"]')
  await page.click('text=Testar ambiente')
  await page.waitForSelector('text=fake claude', { timeout: 20000 })
  await shot('02-config')

  await page.click('button[aria-label="Nova feature"]')
  await page.fill('input[placeholder="CHK-123"]', 'CHK-9')
  await page.click('text=Buscar no Jira')
  await page.waitForFunction(() => document.querySelector('input[placeholder^="preenchido"]')?.value === 'Cupom por categoria', null, { timeout: 20000 })
  await page.check('input[aria-label="Incluir repo-a"]')
  await page.fill('input[aria-label="Escopo repo-a"]', 'coupon')
  await shot('03-nova-feature')
  await page.click('button:has-text("Criar feature")')

  await page.waitForSelector('text=Limite de categorias', { timeout: 20000 })
  await shot('04-negocio')
  await page.fill('textarea[placeholder^="Escreva o que foi falado"]', 'PM: vale 3 categorias')
  await page.fill('textarea[placeholder="- PM confirmou que…"]', '- alinhado na daily')
  await page.click('text=Reanalisar com as respostas')
  await page.waitForSelector('text=reanalisado', { timeout: 20000 })
  await shot('05-negocio-reanalisado')

  await page.click('text=Seguir para refinamento técnico')
  await page.waitForSelector('text=De onde vem o preço?', { timeout: 20000 })
  await shot('06-tecnico-pergunta')
  await page.fill('textarea >> nth=0', 'pricing-api, squad Pricing')
  await page.click('text=Responder e continuar')
  await page.waitForSelector('text=pricing-api', { timeout: 20000 })
  await page.waitForSelector('text=[Web] z', { timeout: 20000 })
  await shot('07-tecnico-ok')

  await page.click('button:has-text("Gerar spec com kiro-cli")')
  await page.waitForSelector('text=# Requisitos', { timeout: 20000 })
  await page.click('button[role="tab"]:has-text("tasks.md")')
  await sleep(500)
  await shot('08-spec')

  await page.click('button:has-text("Aprovar spec")')
  await page.waitForSelector('text=2/2 concluídas', { timeout: 30000 })
  await shot('09-dev')

  await page.click('button[aria-label="Board"]')
  await shot('10-board')

  const calls = fs.readFileSync(env.FAKE_LOG, 'utf8').trim().split('\n').length
  console.log('fake calls', calls)
  await app.close()
})().catch(async (e) => { console.error('E2E FAILED', e); process.exit(1) })
