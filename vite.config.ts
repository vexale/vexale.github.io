import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const nested = await Promise.all(entries.map(entry => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  }))
  return nested.flat()
}

function offlinePrecachePlugin(): Plugin {
  return {
    name: 'vexale-offline-precache',
    apply: 'build',
    closeBundle: async () => {
      const output = resolve(projectRoot, 'dist')
      const coreSource = resolve(projectRoot, 'node_modules/tesseract.js-core')
      const coreOutput = resolve(output, 'ocr/core')
      await mkdir(coreOutput, { recursive: true })
      const coreFiles = (await readdir(coreSource)).filter(name => /(?:^|-)lstm\.wasm(?:\.js)?$/i.test(name))
      await Promise.all(coreFiles.map(name => cp(resolve(coreSource, name), resolve(coreOutput, name))))
      await cp(resolve(projectRoot, 'node_modules/pdfjs-dist/standard_fonts'), resolve(output, 'pdf/standard_fonts'), { recursive: true })
      await cp(resolve(projectRoot, 'node_modules/pdfjs-dist/cmaps'), resolve(output, 'pdf/cmaps'), { recursive: true })

      const allFiles = await filesUnder(output)
      const localAssets = new Set<string>([
        '/app/',
        '/app/index.html',
        '/manifest.webmanifest',
      ])
      const offlineExtensions = /\.(?:html|m?js|css|wasm|bcmap|woff2?|ttf|otf|pfb|png|jpe?g|webp|svg|ico|webmanifest)$/i
      for (const path of allFiles) {
        const name = relative(output, path).split(sep).join('/')
        if (offlineExtensions.test(name) && name !== 'sw.js') localAssets.add(`/${name}`)
      }

      const appHtml = await readFile(resolve(output, 'app/index.html'), 'utf8')
      const fontStylesheets = [...appHtml.matchAll(/https:\/\/fonts\.googleapis\.com\/css2[^"'\s<>]+/g)]
        .map(match => match[0].replace(/&amp;/g, '&'))
      const tesseract = JSON.parse(await readFile(resolve(projectRoot, 'node_modules/tesseract.js/package.json'), 'utf8')) as { version: string }
      const core = JSON.parse(await readFile(resolve(projectRoot, 'node_modules/tesseract.js-core/package.json'), 'utf8')) as { version: string }
      const workerUrl = `https://cdn.jsdelivr.net/npm/tesseract.js@v${tesseract.version}/dist/worker.min.js`
      const coreBase = `https://cdn.jsdelivr.net/npm/tesseract.js-core@v${core.version}`
      const coreVariants = ['tesseract-core-lstm', 'tesseract-core-simd-lstm', 'tesseract-core-relaxedsimd-lstm']
      const remoteAssets = [...new Set([
        ...fontStylesheets,
        workerUrl,
        ...coreVariants.flatMap(name => [`${coreBase}/${name}.wasm.js`, `${coreBase}/${name}.wasm`]),
        'https://cdn.jsdelivr.net/npm/@tesseract.js-data/ara/4.0.0_best_int/ara.traineddata.gz',
        'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
      ])]
      const assets = [...localAssets].sort()
      const version = createHash('sha256')
        .update(await readFile(resolve(projectRoot, 'public/sw.js')))
        .update(assets.join('\n'))
        .update(remoteAssets.join('\n'))
        .digest('hex')
        .slice(0, 16)
      const manifest = { version, assets: [...assets, '/precache-manifest.json'], remoteAssets }
      await writeFile(resolve(output, 'precache-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

      const serviceWorkerPath = resolve(output, 'sw.js')
      const serviceWorker = await readFile(serviceWorkerPath, 'utf8')
      await writeFile(serviceWorkerPath, serviceWorker
        .replaceAll('__PRECACHE_VERSION__', version)
        .replace('__PRECACHE_ASSETS__', JSON.stringify(manifest.assets))
        .replace('__REMOTE_PRECACHE__', JSON.stringify(remoteAssets)), 'utf8')
    },
  }
}

export default defineConfig({
  plugins: [react(), offlinePrecachePlugin()],
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(projectRoot, 'index.html'),
        app: resolve(projectRoot, 'app/index.html'),
      },
    },
  },
})
