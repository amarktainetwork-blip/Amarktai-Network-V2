import { test, expect, request } from 'playwright/test'

const baseURL = process.env.RELEASE_FIXTURE_BASE_URL || 'http://127.0.0.1:3210'
const email = process.env.ADMIN_EMAIL || 'fixture-admin@invalid.example'
const password = process.env.ADMIN_PASSWORD || ''

test.describe.configure({ mode: 'serial', timeout: 12 * 60_000 })

let page
let token = ''
let imageArtifactId = ''
let videoArtifactId = ''
let ttsArtifactId = ''
const consoleErrors = []
const stylesheetFailures = []

test.beforeAll(async ({ browser }) => {
  expect(password, 'ADMIN_PASSWORD must be supplied by the fixture runner').not.toBe('')
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('response', (response) => {
    if (response.request().resourceType() === 'stylesheet' && !response.ok()) stylesheetFailures.push(`${response.status()} ${response.url()}`)
  })
})

test.afterAll(async () => {
  await page?.close()
})

test.afterEach(async ({}, testInfo) => {
  await testInfo.attach('browser-console-errors', {
    body: Buffer.from(consoleErrors.length ? consoleErrors.join('\n') : 'none\n'),
    contentType: 'text/plain',
  })
  await testInfo.attach('stylesheet-failures', {
    body: Buffer.from(stylesheetFailures.length ? stylesheetFailures.join('\n') : 'none\n'),
    contentType: 'text/plain',
  })
})

test('styled login establishes the verified dashboard shell', async () => {
  await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'AmarktAI Network' })).toBeVisible()
  await expect(page.locator('form')).toBeVisible()
  const formBackground = await page.locator('form').evaluate((form) => getComputedStyle(form.parentElement).backgroundColor)
  expect(formBackground).not.toBe('rgba(0, 0, 0, 0)')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('**/dashboard')
  await expect(page.locator('aside')).toBeVisible()
  await expect(page.getByText('AmarktAI Network', { exact: true }).first()).toBeVisible()
  token = await page.evaluate(() => localStorage.getItem('amarktai_token') || '')
  expect(token.length).toBeGreaterThan(20)
  expect(stylesheetFailures).toEqual([])

  const layout = await page.locator('aside').evaluate((aside) => {
    const box = aside.getBoundingClientRect()
    return { display: getComputedStyle(aside).display, left: box.left, right: box.right, width: box.width }
  })
  expect(layout.display).not.toBe('none')
  expect(layout.left).toBe(0)
  expect(layout.width).toBeGreaterThan(200)
})

test('provider settings and canonical truth are consistent without browser keys', async () => {
  const [truthResponse, providersResponse] = await Promise.all([
    adminRequest('/api/admin/truth'),
    adminRequest('/api/admin/providers'),
  ])
  expect(truthResponse.status()).toBe(200)
  expect(providersResponse.status()).toBe(200)
  const truth = (await truthResponse.json()).truth
  const providers = (await providersResponse.json()).providers
  expect(truth.releaseCandidateCapabilities.length).toBeGreaterThan(0)
  expect(providers).toHaveLength(4)
  for (const provider of providers) {
    expect(provider.apiKey).toBeUndefined()
    const canonical = truth.providers.find((item) => item.provider === provider.providerKey)
    expect(canonical?.credentialConfigured).toBe(provider.configured)
    expect(canonical?.healthStatus).toBe(provider.healthStatus)
  }
  expect(truth.providers.find((item) => item.provider === 'mimo')?.codingOnly).toBe(true)
})

test('chat renders a multi-chunk SSE response with execution evidence', async () => {
  await page.goto(`${baseURL}/dashboard/chat`)
  await expect(page.getByRole('heading', { name: 'Chat' })).toBeVisible()
  await page.getByPlaceholder('Message AmarktAI...').fill('Stream the fixture response.')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('Deterministic fixture stream.', { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('3 chunks', { exact: true })).toBeVisible()
})

test('image result is rendered, range-readable, and downloadable', async () => {
  await page.goto(`${baseURL}/dashboard/image`)
  const imagePrompt = page.getByPlaceholder('Describe the image you want to generate...')
  await imagePrompt.fill('A deterministic green release fixture')
  await imagePrompt.press('Enter')
  const image = page.getByAltText('Generated image')
  await expect(image).toBeVisible({ timeout: 90_000 })
  const download = page.getByRole('link', { name: 'Download' })
  await expect(download).toBeVisible()
  imageArtifactId = artifactIdFromHref(await download.getAttribute('href'))
  await expectArtifact(imageArtifactId, 'image/')
  await expectDownload(imageArtifactId)
})

test('music result has playable audio and an authenticated download', async () => {
  await page.goto(`${baseURL}/dashboard/music`)
  const prompt = page.getByPlaceholder('Describe the instrumental music you want to create...')
  await expect(prompt).toBeEnabled({ timeout: 30_000 })
  await prompt.fill('A deterministic instrumental fixture')
  await page.getByRole('button', { name: 'Generate Instrumental Music' }).click()
  const audio = page.locator('audio')
  await expect(audio).toBeVisible({ timeout: 90_000 })
  await expect(page.getByRole('link', { name: 'Download Audio' })).toBeVisible()
  const source = await audio.getAttribute('src')
  const musicArtifactId = artifactIdFromHref(source)
  await expectArtifact(musicArtifactId, 'audio/')
  await expectDownload(musicArtifactId)
})

test('Voice Studio executes TTS and transcribes the same-run authorised audio', async () => {
  await page.goto(`${baseURL}/dashboard/voice`)
  await expect(page.getByRole('heading', { name: 'Voice Studio' })).toBeVisible()
  await page.getByPlaceholder('Text to speak').fill('AmarktAI browser fixture voice proof.')
  await page.getByRole('button', { name: 'Generate speech' }).click()
  const download = page.getByRole('link', { name: 'Download audio' })
  await expect(download).toBeVisible({ timeout: 90_000 })
  ttsArtifactId = artifactIdFromHref(await download.getAttribute('href'))
  await expectArtifact(ttsArtifactId, 'audio/')
  await expectDownload(ttsArtifactId)

  await page.getByRole('button', { name: 'STT' }).click()
  const sourceSelect = page.locator('select').first()
  await expect(sourceSelect.locator(`option[value="${ttsArtifactId}"]`)).toHaveCount(1, { timeout: 30_000 })
  await sourceSelect.selectOption(ttsArtifactId)
  await page.getByRole('button', { name: 'Transcribe' }).click()
  await expect(page.getByText('Deterministic fixture transcription.', { exact: true })).toBeVisible({ timeout: 90_000 })
})

test('source-artifact video flow renders provenance, preview, and download', async () => {
  await page.goto(`${baseURL}/dashboard/video`)
  await page.getByRole('button', { name: /Image to video/ }).click()
  const sourceSelect = page.locator('select')
  await expect(sourceSelect.locator(`option[value="${imageArtifactId}"]`)).toHaveCount(1, { timeout: 30_000 })
  await sourceSelect.selectOption(imageArtifactId)
  await expect(page.getByText(new RegExp(`Source provenance: .*${imageArtifactId}`))).toBeVisible()
  await page.getByPlaceholder('Describe the video').fill('Animate the selected fixture image')
  await page.getByRole('button', { name: 'Generate video' }).click()
  const download = page.getByRole('link', { name: 'Download video' })
  await expect(download).toBeVisible({ timeout: 120_000 })
  videoArtifactId = artifactIdFromHref(await download.getAttribute('href'))
  await expectArtifact(videoArtifactId, 'video/')

  await page.getByRole('button', { name: /Video to video/ }).click()
  await expect(sourceSelect.locator(`option[value="${videoArtifactId}"]`)).toHaveCount(1, { timeout: 30_000 })
  await sourceSelect.selectOption(videoArtifactId)
  await expect(page.locator('video').first()).toBeVisible()
})

test('long-form execution survives reload and renders component/final evidence', async () => {
  const submitted = await adminRequest('/api/admin/long-form-video/executions', {
    method: 'POST',
    data: {
      request: {
        prompt: 'A deterministic release fixture story', targetDurationSeconds: 30, sceneCount: 3,
        aspectRatio: '16:9', style: 'cinematic', tone: 'professional', voiceoverEnabled: false,
        subtitlesEnabled: false, musicBedEnabled: false, count: 1, routingMode: 'balanced',
      },
    },
  })
  expect(submitted.status()).toBe(202)
  const { executionId } = await submitted.json()
  expect(executionId).toBeTruthy()
  await page.goto(`${baseURL}/dashboard/video`)
  await page.getByRole('button', { name: /Long-form video/ }).click()
  await page.evaluate((id) => localStorage.setItem('amarktai_long_form_execution_id', id), executionId)
  await page.reload()
  await expect(page.getByText(executionId, { exact: true })).toBeVisible({ timeout: 30_000 })
  const main = page.getByRole('main')
  for (const component of ['Scene plan', 'Voiceover', 'Subtitles', 'Music', 'Assembly']) {
    await expect(main.getByText(component, { exact: true }).last()).toBeVisible()
  }
  const finalDownload = page.getByRole('link', { name: 'Download final video' })
  await expect(finalDownload).toBeVisible({ timeout: 8 * 60_000 })
  const finalPreview = page.locator('video').last()
  await expect(finalPreview).toBeVisible()
  await expect.poll(() => finalPreview.evaluate((video) => video.readyState), { timeout: 30_000 }).toBeGreaterThanOrEqual(1)
  const finalId = artifactIdFromHref(await finalDownload.getAttribute('href'))
  const durable = await adminRequest(`/api/admin/long-form-video/executions/${executionId}`)
  expect(durable.status()).toBe(200)
  const execution = (await durable.json()).execution
  expect(execution.scenes).toHaveLength(3)
  expect(execution.scenes.every((scene) => scene.status === 'completed' && scene.artifactId)).toBe(true)
  expect(execution.componentState.voiceover).toMatchObject({ requested: false, ready: true })
  expect(execution.componentState.subtitles).toMatchObject({ requested: false, ready: true })
  expect(execution.componentState.musicBed.requested).toBe(false)
  expect(execution.componentState.musicBed.status).toBe('not_requested')
  expect(execution.componentState.assembly.ready).toBe(true)
  await expectArtifact(finalId, 'video/')
  await expectDownload(finalId)
})

test('product-breakout workspace executes candidates, approvals and the authorised final pack', async () => {
  await page.goto(`${baseURL}/dashboard/social-ad`)
  await expect(page.getByRole('heading', { name: 'Product-Breakout Social Ads' })).toBeVisible()
  await expect(page.getByLabel('Approved product asset').locator('option')).not.toHaveCount(0, { timeout: 30_000 })
  await page.getByLabel('Candidates').fill('2')
  await page.getByRole('button', { name: 'Plan without execution' }).click()
  await expect(page.getByText('product-breakout-v1', { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('social_post_card_frame', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Execute approved plan' }).click()
  await expect(page.getByRole('button', { name: 'Approve winner' })).toBeVisible({ timeout: 4 * 60_000 })
  await expect(page.locator('video')).toHaveCount(2)
  await expect(page.getByText(/Execution evidence: .*fixture\/image_to_video/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Approve winner' }).click()
  await expect(page.getByRole('button', { name: 'Assemble deterministic social pack' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Assemble deterministic social pack' }).click()
  await expect(page.getByRole('button', { name: 'Final approve delivery pack' })).toBeVisible({ timeout: 6 * 60_000 })
  await expect(page.getByText('Final delivery pack', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Download / })).toHaveCount(10)
  await page.getByRole('button', { name: 'Final approve delivery pack' }).click()
  await expect(page.getByText('completed', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
})

test('specialist vision workspace renders authorised artifacts and exact production blockers', async () => {
  await page.goto(`${baseURL}/dashboard/specialist-vision`)
  await expect(page.getByRole('heading', { name: 'Specialist Vision' })).toBeVisible()
  const task = page.locator('select').first()
  await expect(task.locator('option')).toHaveCount(6)
  await expect(page.getByText('Truthfully blocked', { exact: true })).toBeVisible()
  await expect(page.getByText(/Local fixture proof is not live-provider proof|production-compatible executor/i)).toBeVisible()
  await expect(page.getByText('Authorised source artifact')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Submit' })).toBeDisabled()
  await task.selectOption('video_classification')
  await expect(page.locator('select').nth(1).locator('option')).not.toHaveCount(0)
})

test('dashboards expose no provider/model override controls and navigation has no console errors', async () => {
  for (const route of ['chat', 'image', 'video', 'music', 'voice', 'capability-lab', 'specialist-vision', 'social-ad']) {
    await page.goto(`${baseURL}/dashboard/${route}`)
    await expect(page.locator('input[name="provider"],select[name="provider"],input[name="model"],select[name="model"]')).toHaveCount(0)
    await expect(page.getByLabel('Provider', { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Model', { exact: true })).toHaveCount(0)
  }
  expect(stylesheetFailures).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('logout revokes the session and denies protected dashboard access', async () => {
  await page.goto(`${baseURL}/dashboard/chat`)
  const oldToken = token
  await page.getByRole('button', { name: 'Logout' }).click()
  await page.waitForURL('**/login', { timeout: 30_000 })
  expect(await page.evaluate(() => localStorage.getItem('amarktai_token'))).toBeNull()
  const denied = await page.request.get(`${baseURL}/api/admin/truth`, { headers: { Authorization: `Bearer ${oldToken}` } })
  expect(denied.status()).toBe(401)
})

test('expired token is cleared and redirected to login', async () => {
  await page.evaluate(() => localStorage.setItem('amarktai_token', 'expired-fixture-token'))
  await page.goto(`${baseURL}/dashboard/chat`)
  await page.waitForURL('**/login?next=%2Fdashboard%2Fchat', { timeout: 30_000 })
  expect(await page.evaluate(() => localStorage.getItem('amarktai_token'))).toBeNull()
})

async function adminRequest(path, options = {}) {
  return page.request.fetch(`${baseURL}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  })
}

async function expectArtifact(id, mimePrefix) {
  expect(id).toBeTruthy()
  const response = await adminRequest(`/api/admin/artifacts/${id}/file`, { headers: { Range: 'bytes=0-31' } })
  expect([200, 206]).toContain(response.status())
  expect(response.headers()['content-type']?.startsWith(mimePrefix)).toBe(true)
  expect(Number(response.headers()['content-length'] || 0)).toBeGreaterThan(0)
  const anonymous = await request.newContext()
  try {
    const unauthorised = await anonymous.get(`${baseURL}/api/admin/artifacts/${id}/file?anonymous-proof=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-store' },
    })
    expect(unauthorised.status()).toBe(401)
  } finally {
    await anonymous.dispose()
  }
}

async function expectDownload(id) {
  const response = await adminRequest(`/api/admin/artifacts/${id}/file?download=1`)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-disposition'] || '').toMatch(/^attachment;/)
  expect((await response.body()).length).toBeGreaterThan(0)
}

function artifactIdFromHref(href) {
  return String(href || '').match(/artifacts\/([^/]+)\/file/)?.[1] || ''
}
