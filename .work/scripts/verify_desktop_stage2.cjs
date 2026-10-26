const { chromium } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const projectRoot = process.cwd()
const outputDir = path.join(projectRoot, '.work', 'desktop-v2', 'stage-2')
const appUrl = pathToFileURL(path.join(projectRoot, 'dist', 'index.html')).href
const browserPath = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const spaceFixture = path.join(outputDir, 'space-proof.txt')
const officeFixture = path.join(outputDir, 'office-proof.txt')
const screenshots = {}

async function ensureSpaceLanguage(page, language) {
  const root = page.locator('.ui-app')
  const current = await root.getAttribute('lang')
  if (current !== language) {
    await page.getByRole('button', { name: 'Switch interface language', exact: true }).click()
    await page.waitForFunction(target => document.querySelector('.ui-app')?.getAttribute('lang') === target, language)
  }
}

async function capture(page, name) {
  const destination = path.join(outputDir, name)
  const dimensions = page.viewportSize()
  const metrics = await page.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
  }))
  const sidebar = await page.locator('.desk-sidebar').boundingBox()
  await page.screenshot({ path: destination, fullPage: true, animations: 'disabled' })
  screenshots[name] = {
    path: destination,
    viewport: dimensions,
    horizontalOverflow: metrics.horizontalOverflow,
    bodyWidth: metrics.bodyWidth,
    sidebarX: sidebar?.x ?? null,
  }
  return screenshots[name]
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true })
  const browser = await chromium.launch({
    headless: true,
    executablePath: browserPath,
    args: ['--allow-file-access-from-files', '--disable-web-security'],
  })

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
    const pageErrors = []
    const consoleErrors = []
    const blockedResources = []
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    page.on('requestfailed', request => blockedResources.push({ url: request.url(), failure: request.failure()?.errorText ?? 'unknown' }))
    await page.route('https://**/*', route => route.request().url().startsWith('https://fonts.googleapis.com/')
      ? route.fulfill({ status: 200, contentType: 'text/css', body: '' })
      : route.abort())
    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.locator('.ui-app').waitFor({ state: 'visible', timeout: 10000 })
    await ensureSpaceLanguage(page, 'en')

    const skipTour = page.getByRole('button', { name: 'Skip tour', exact: true })
    if (await skipTour.isVisible().catch(() => false)) await skipTour.click()

    const spaceRoot = page.locator('.ui-category-card').first()
    const rootTitle = (await spaceRoot.locator(':scope > button').innerText()).trim()
    await spaceRoot.locator(':scope > button').click()
    await spaceRoot.locator('.ui-upload-zone').waitFor({ state: 'visible', timeout: 10000 })
    const childInput = spaceRoot.locator('input:not([type])').first()
    await childInput.fill('Phase 2 QA branch')
    await childInput.press('Enter')
    const childCard = spaceRoot.locator('.ui-category-card').first()
    await childCard.locator(':scope > button').waitFor({ state: 'visible', timeout: 10000 })
    await childCard.locator(':scope > button').click()
    await page.locator('.ui-app').waitFor({ state: 'visible' })

    await spaceRoot.locator('.ui-upload-zone').first().locator('input[type="file"]').setInputFiles(spaceFixture)
    await page.getByText('space-proof.txt', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
    const spaceUploadVisibleInSpace = await page.getByText('space-proof.txt', { exact: true }).isVisible()

    await page.getByRole('button', { name: 'Switch to Office mode', exact: true }).click()
    await page.locator('.desk-app').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByRole('heading', { name: rootTitle, exact: true }).waitFor({ state: 'visible', timeout: 10000 })
    await page.getByText('space-proof.txt', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
    const spaceUploadVisibleInOffice = await page.getByText('space-proof.txt', { exact: true }).isVisible()

    const treeToggle = page.locator('.desk-tree-toggle').first()
    const initialExpanded = await treeToggle.getAttribute('aria-expanded')
    if (initialExpanded !== 'true') throw new Error(`Expected expanded section tree, received ${String(initialExpanded)}`)
    await capture(page, 'tree-expanded-en-1280x800.png')
    await treeToggle.click()
    await page.locator('.desk-library-empty').waitFor({ state: 'visible', timeout: 5000 })
    const collapsedExpanded = await page.locator('.desk-tree-toggle').first().getAttribute('aria-expanded')
    if (collapsedExpanded !== 'false') throw new Error('Section tree did not collapse')
    await capture(page, 'tree-collapsed-en-1280x800.png')
    await page.locator('.desk-tree-toggle').first().click()
    await page.getByText('space-proof.txt', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })

    await page.locator('.desk-visually-hidden[type="file"]').setInputFiles(officeFixture)
    await page.getByText('office-proof.txt', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })

    const editor = page.locator('.desk-note-editor')
    await editor.fill('Shared stage two note proof')
    await page.getByText('Saved on this device', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })

    await capture(page, 'section-en-1280x800.png')
    const englishSidebarX = screenshots['section-en-1280x800.png'].sidebarX
    if (englishSidebarX === null || englishSidebarX > 400) throw new Error(`English sidebar should be on the left; x=${String(englishSidebarX)}`)

    await page.locator('.desk-topbar-actions button').first().click()
    await page.getByRole('heading', { name: 'المكتبة', exact: true }).waitFor({ state: 'visible', timeout: 10000 })
    if ((await page.locator('.desk-app').getAttribute('dir')) !== 'rtl') throw new Error('Arabic direction was not applied')
    await capture(page, 'section-ar-1280x800.png')
    const arabicSidebarX = screenshots['section-ar-1280x800.png'].sidebarX
    if (arabicSidebarX === null || arabicSidebarX < 600) throw new Error(`Arabic sidebar should be on the right; x=${String(arabicSidebarX)}`)

    await page.setViewportSize({ width: 390, height: 844 })
    await capture(page, 'section-ar-390x844.png')
    await page.locator('.desk-topbar-actions button').first().click()
    await page.getByRole('heading', { name: 'Library', exact: true }).waitFor({ state: 'visible', timeout: 10000 })
    await capture(page, 'section-en-390x844.png')

    await page.getByRole('button', { name: 'Switch to Space mode', exact: true }).click()
    await page.locator('.ui-app').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByText('office-proof.txt', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
    const officeUploadVisibleInSpace = await page.getByText('office-proof.txt', { exact: true }).isVisible()
    await page.getByRole('button', { name: 'Switch to Office mode', exact: true }).click()
    await page.locator('.desk-app').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByText('space-proof.txt', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
    await page.getByText('office-proof.txt', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })

    const report = {
      appUrl,
      rootTitle,
      sharing: {
        spaceUploadVisibleInSpace,
        spaceUploadVisibleInOffice,
        officeUploadVisibleInSpace,
      },
      tree: { expanded: initialExpanded === 'true', collapsed: collapsedExpanded === 'false' },
      layout: {
        englishSidebarLeft: englishSidebarX !== null && englishSidebarX < 400,
        arabicSidebarRight: arabicSidebarX !== null && arabicSidebarX > 600,
      },
      pageErrors,
      consoleErrors,
      blockedResources,
      screenshots,
    }
    fs.writeFileSync(path.join(outputDir, 'verification.json'), JSON.stringify(report, null, 2), 'utf8')
    console.log(JSON.stringify(report, null, 2))
    const overflow = Object.values(screenshots).some(result => result.horizontalOverflow)
    if (pageErrors.length || consoleErrors.length || blockedResources.length || overflow || !spaceUploadVisibleInSpace || !spaceUploadVisibleInOffice || !officeUploadVisibleInSpace || !report.tree.collapsed || !report.tree.expanded || !report.layout.englishSidebarLeft || !report.layout.arabicSidebarRight) process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
