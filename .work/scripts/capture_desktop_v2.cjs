const { chromium } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const projectRoot = process.cwd()
const stageName = process.env.SCREENSHOT_STAGE || 'stage-1'
const outputDir = path.join(projectRoot, '.work', 'desktop-v2', stageName)
const appUrl = pathToFileURL(path.join(projectRoot, 'dist', 'index.html')).href
const browserPath = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

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
    const blockedResources = []
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('requestfailed', request => blockedResources.push({ url: request.url(), failure: request.failure()?.errorText ?? 'unknown' }))
    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(900)

    const skipTour = page.getByRole('button', { name: 'Skip tour', exact: true })
    if (await skipTour.isVisible().catch(() => false)) await skipTour.click()

    await page.getByRole('button', { name: 'Switch to Office mode', exact: true }).click()
    await page.locator('.desk-app').waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForTimeout(300)
    const mode = await page.locator('html').getAttribute('data-mode')
    if (mode !== 'desktop') throw new Error(`Expected desktop mode, received ${String(mode)}`)

    const capture = async (name) => {
      const viewport = page.viewportSize()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
      const sidebar = await page.locator('.desk-sidebar').boundingBox()
      const destination = path.join(outputDir, name)
      await page.screenshot({ path: destination, fullPage: true, animations: 'disabled' })
      return { file: destination, viewport, horizontalOverflow: overflow, sidebarX: sidebar?.x ?? null }
    }

    const results = {}
    results['en-1280x800.png'] = await capture('en-1280x800.png')

    await page.locator('.desk-topbar-actions button').first().click()
    await page.getByRole('heading', { name: 'المكتبة', exact: true }).waitFor({ state: 'visible' })
    if ((await page.locator('.desk-app').getAttribute('dir')) !== 'rtl') throw new Error('Arabic direction was not applied')
    results['ar-1280x800.png'] = await capture('ar-1280x800.png')

    await page.setViewportSize({ width: 390, height: 844 })
    results['ar-390x844.png'] = await capture('ar-390x844.png')

    await page.locator('.desk-topbar-actions button').first().click()
    await page.getByRole('heading', { name: 'Library', exact: true }).waitFor({ state: 'visible' })
    if ((await page.locator('.desk-app').getAttribute('dir')) !== 'ltr') throw new Error('English direction was not applied')
    results['en-390x844.png'] = await capture('en-390x844.png')

    const currentPage = await page.locator('.desk-page-title').innerText()
    const report = { appUrl, mode, currentPage, pageErrors, blockedResources, captures: results }
    fs.writeFileSync(path.join(outputDir, 'verification.json'), JSON.stringify(report, null, 2), 'utf8')
    console.log(JSON.stringify(report, null, 2))
    if (pageErrors.length > 0) process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
