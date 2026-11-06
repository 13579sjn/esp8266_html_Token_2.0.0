/**
 * 零依赖静态服务器：只服务构建后的 dist/ 目录。
 * 用于不想安装/运行 Vite 时，直接打开已经构建好的页面。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const distRoot = resolve(projectRoot, 'dist')
const host = process.env.HOST ?? '127.0.0.1'
const port = Number(process.env.PORT ?? 4173)
const openbrowser = process.argv.includes('--open')

function launchBrowser(url) {
  try {
    if (process.platform === 'win32') {
      const child = spawn('cmd.exe', ['/c', 'start', '', url], {
        stdio: 'ignore',
        windowsHide: true,
      })
      child.on('error', () => {})
      child.unref()
      return
    }

    const command = process.platform === 'darwin' ? 'open' : 'xdg-open'
    const child = spawn(command, [url], { stdio: 'ignore', detached: true })
    child.on('error', () => {})
    child.unref()
  } catch {
    // 打开浏览器失败不影响服务本身，控制台里仍然会打印地址。
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' })
    response.end('Method Not Allowed')
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', `http://${host}`).pathname)
  } catch {
    response.writeHead(400)
    response.end('Bad Request')
    return
  }

  if (pathname === '/') pathname = '/index.html'

  const filePath = resolve(distRoot, `.${pathname}`)
  if (filePath !== distRoot && !filePath.startsWith(`${distRoot}${sep}`)) {
    response.writeHead(403)
    response.end('Forbidden')
    return
  }

  try {
    const body = await readFile(filePath)
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    })
    if (request.method === 'HEAD') response.end()
    else response.end(body)
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'EISDIR')) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('404 - 页面不存在。请先运行 npm run build 生成 dist/。')
      return
    }
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('500 - 读取页面文件失败。')
  }
})

server.on('error', (error) => {
  if (error && error.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用。`)
    console.error(`如果页面已经在运行，直接访问：http://${host}:${port}/`)
    if (openbrowser) launchBrowser(`http://${host}:${port}/`)
    process.exit(1)
  }
  throw error
})

server.listen(port, host, () => {
  const url = `http://${host}:${port}/`
  console.log('')
  console.log('  OneNET Token Generator 已启动')
  console.log(`  打开：${url}`)
  console.log('  按 Ctrl+C 停止服务')
  console.log('')
  if (openbrowser) {
    console.log('  正在打开浏览器...')
    launchBrowser(url)
  }
})
