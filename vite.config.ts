import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * 生产构建时注入 CSP：页面只允许加载自身资源，避免任何设备密钥/Token
 * 被第三方脚本带出浏览器。开发模式不注入，否则 Vite 的 React Refresh
 * 内联脚本会被拦截。
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'onenet:inject-csp',
      apply: 'build',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          const meta = `    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" />`
          if (html.includes('<meta charset="UTF-8" />')) {
            return html.replace(
              '<meta charset="UTF-8" />',
              `<meta charset="UTF-8" />\n${meta}`,
            )
          }
          return html.replace('<head>', `<head>\n${meta}`)
        },
      },
    },
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
