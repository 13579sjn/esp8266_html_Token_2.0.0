import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { FocusEvent as ReactFocusEvent, FormEvent, MouseEvent as ReactMouseEvent } from 'react'
import { gsap } from 'gsap'
import {
  MotionConfig,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'motion/react'

import { DeviceForm } from './components/DeviceForm'
import { DataCommPanel } from './components/DataCommPanel'
import { DataForge } from './components/DataForge'
import { CardTilt } from './components/CardTilt'
import { Header } from './components/Header'
import type { ThemeMode, ViewMode } from './components/Header'
import { TechBackground } from './components/TechBackground'
import { ScrollProgress } from './components/ScrollProgress'
import { ResultPanel } from './components/ResultPanel'
import { SecurityNote } from './components/SecurityNote'
import { Toast } from './components/Toast'
import type { ToastState, ToastType } from './components/Toast'
import { BrandMark, ExternalLinkIcon } from './components/Icons'
import { formatTtl } from './lib/format'
import { emitForgeAction } from './lib/forgeBus'
import { buildOneNetToken, OneNetTokenError, ONENET_VERSION } from './lib/onenet'
import {
  DEFAULT_FORM,
  countErrors,
  isResultStale,
  validateForm,
  type FieldErrors,
  type FormValues,
  type TokenResult,
} from './model'

const FIELD_ORDER: (keyof FieldErrors)[] = [
  'productName',
  'productId',
  'deviceName',
  'keyBase64',
  'ttl',
]

const FIELD_ELEMENT_IDS: Record<keyof FieldErrors, string> = {
  productName: 'field-productName',
  productId: 'field-productId',
  deviceName: 'field-deviceName',
  keyBase64: 'field-keyBase64',
  ttl: 'field-customTtl',
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 某些浏览器会拒绝剪贴板权限，继续尝试兼容方案。
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '0'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const succeeded = document.execCommand('copy')
    textarea.remove()
    return succeeded
  } catch {
    return false
  }
}

export default function App() {
  const [form, setForm] = useState<FormValues>(DEFAULT_FORM)
  const [attempted, setAttempted] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [keyAutoCleared, setKeyAutoCleared] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [justGenerated, setJustGenerated] = useState(false)
  const [result, setResult] = useState<TokenResult | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [toast, setToast] = useState<ToastState | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [theme, setTheme] = useState<ThemeMode>('dark')
  const [view, setView] = useState<ViewMode>('token')

  const keyValueRef = useRef(form.keyBase64)
  const generatingRef = useRef(false)
  const copyTimerRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const successTimerRef = useRef<number | null>(null)
  const themeTimerRef = useRef<number | null>(null)
  const tokenScreenRef = useRef<HTMLElement>(null)
  const dataScreenRef = useRef<HTMLElement>(null)
  const previousViewRef = useRef<ViewMode>('token')
  const switchingViewRef = useRef(false)

  const { scrollY } = useScroll()
  const reduceMotion = useReducedMotion()
  const schematicY = useTransform(scrollY, [0, 720], [0, -30])

  const validation = useMemo(() => validateForm(form), [form])
  const errors = attempted ? validation.errors : {}
  const previewEt =
    validation.ttlSeconds != null
      ? Math.floor(nowMs / 1000) + validation.ttlSeconds
      : null

  const isStale = useMemo(
    () => (result ? isResultStale(result, form, validation.ttlSeconds) : false),
    [result, form, validation.ttlSeconds],
  )

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const themeColor = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    )
    if (themeColor) {
      themeColor.content = theme === 'dark' ? '#0b1512' : '#f3f1ea'
    }
  }, [theme])

  useEffect(() => {
    if (!result) return
    emitForgeAction('generate', result.method)
  }, [result])

  useLayoutEffect(() => {
    const previous = previousViewRef.current
    if (previous === view) return

    const screen =
      view === 'token' ? tokenScreenRef.current : dataScreenRef.current
    if (screen && !reduceMotion) {
      gsap.fromTo(
        screen,
        { autoAlpha: 0, x: view === 'data' ? 42 : -42 },
        {
          autoAlpha: 1,
          x: 0,
          duration: 0.5,
          ease: 'power3.out',
          clearProps: 'opacity,visibility,transform',
        },
      )
    }

    const forge = document.querySelector<HTMLElement>('.data-forge')
    if (forge) {
      const header = document.querySelector<HTMLElement>('.masthead')
      const top = forge.offsetTop - (header?.offsetHeight ?? 72) - 8
      window.scrollTo({
        top: Math.max(0, top),
        behavior: reduceMotion ? 'auto' : 'smooth',
      })
    }

    previousViewRef.current = view
  }, [view, reduceMotion])

  function handleViewChange(next: ViewMode) {
    if (next === view) return
    switchingViewRef.current = true
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    emitForgeAction('switch', next)
    setView(next)
    window.setTimeout(() => {
      switchingViewRef.current = false
    }, 500)
  }

  function handleFieldBlur(event: ReactFocusEvent<HTMLElement>) {
    if (switchingViewRef.current) return
    const target = event.target
    if (
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLSelectElement) &&
      !(target instanceof HTMLTextAreaElement)
    ) {
      return
    }
    if (!target.value.trim()) return
    if (!target.closest('.form-panel, .data-comm')) return
    emitForgeAction('field', target.id || target.name || 'field')
  }

  function handleTokenClick(event: ReactMouseEvent<HTMLElement>) {
    const target = event.target
    if (!(target instanceof Element)) return
    const option = target.closest('.segment, .algorithm')
    if (!option) return
    emitForgeAction('field', option.textContent?.trim().slice(0, 28) || '参数')
  }

  function handleDataClick(event: ReactMouseEvent<HTMLElement>) {
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest('button')
    if (!button || button.disabled || !button.closest('.data-comm')) return
    if (button.closest('.comm-tab, .copy-inline, .comm-sources')) return
    if (button.textContent?.includes('复制')) return
    emitForgeAction('data', button.textContent?.trim().slice(0, 28) || '报文')
  }

  useEffect(() => {
    keyValueRef.current = form.keyBase64
  }, [form.keyBase64])

  // 切换到其他标签页 / 页面隐藏时清除表单中的敏感密钥。
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'hidden') return
      if (!keyValueRef.current) return
      setForm((previous) => ({ ...previous, keyBase64: '' }))
      setShowKey(false)
      setKeyAutoCleared(true)
    }

    const handlePageHide = () => {
      setForm((previous) =>
        previous.keyBase64 ? { ...previous, keyBase64: '' } : previous,
      )
      setShowKey(false)
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
      if (successTimerRef.current) window.clearTimeout(successTimerRef.current)
      if (themeTimerRef.current) window.clearTimeout(themeTimerRef.current)
    }
  }, [])

  function handleToggleTheme() {
    const next: ThemeMode = theme === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.theme = next
    setTheme(next)
    document.documentElement.classList.add('theme-animating')
    if (themeTimerRef.current) window.clearTimeout(themeTimerRef.current)
    themeTimerRef.current = window.setTimeout(() => {
      document.documentElement.classList.remove('theme-animating')
    }, 480)
  }

  function showToast(type: ToastType, message: string) {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToast({ id: Date.now(), type, message })
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000)
  }

  function focusField(field: keyof FieldErrors) {
    const element = document.getElementById(FIELD_ELEMENT_IDS[field])
    if (!element) return
    element.focus()
    element.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'center',
    })
  }

  function handleChange<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((previous) => ({ ...previous, [key]: value }))
    setJustGenerated(false)
    if (key === 'keyBase64') setKeyAutoCleared(false)
  }

  function handleToggleKey() {
    setShowKey((previous) => !previous)
  }

  function handleClearKey() {
    setForm((previous) => ({ ...previous, keyBase64: '' }))
    setShowKey(false)
    setKeyAutoCleared(false)
  }

  async function generateToken() {
    if (generatingRef.current) return

    const nextValidation = validateForm(form)
    const nextErrorCount = countErrors(nextValidation.errors)
    setAttempted(true)

    if (nextErrorCount > 0 || nextValidation.ttlSeconds == null) {
      const firstField = FIELD_ORDER.find((field) => nextValidation.errors[field])
      if (firstField) focusField(firstField)
      showToast(
        'error',
        nextErrorCount > 0
          ? `请修正 ${nextErrorCount} 处输入后再生成`
          : '请检查输入后重试',
      )
      return
    }

    generatingRef.current = true
    setGenerating(true)
    setJustGenerated(false)

    try {
      // 让“正在签名”状态先完成一次绘制，再执行同步 HMAC 计算。
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 240)
      })

      const computation = buildOneNetToken({
        productId: form.productId,
        deviceName: form.deviceName,
        keyBase64: form.keyBase64,
        method: form.method,
        ttlSeconds: nextValidation.ttlSeconds,
      })

      const nextResult: TokenResult = {
        ...computation,
        productName: form.productName.trim(),
      }

      setResult(nextResult)
      setNowMs(Date.now())
      setCopiedId(null)
      setJustGenerated(true)
      showToast('success', `Token 已生成，有效期 ${formatTtl(computation.ttlSeconds)}`)

      if (successTimerRef.current) window.clearTimeout(successTimerRef.current)
      successTimerRef.current = window.setTimeout(() => setJustGenerated(false), 2200)

      if (window.matchMedia('(max-width: 1080px)').matches) {
        window.setTimeout(() => {
          document.getElementById('result-panel')?.scrollIntoView({
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
            block: 'start',
          })
        }, 80)
      }
    } catch (error) {
      if (error instanceof OneNetTokenError) {
        setAttempted(true)
        focusField(error.field)
        showToast('error', error.message)
      } else {
        showToast('error', '生成失败，请检查输入后重试')
      }
    } finally {
      generatingRef.current = false
      setGenerating(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void generateToken()
  }

  function handleReset() {
    setForm(DEFAULT_FORM)
    setShowKey(false)
    setAttempted(false)
    setKeyAutoCleared(false)
    setResult(null)
    setCopiedId(null)
    setJustGenerated(false)
    if (successTimerRef.current) window.clearTimeout(successTimerRef.current)
    showToast('success', '已重置，设备密钥已从页面清除')
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  async function handleCopy(id: string, text: string, label: string) {
    const succeeded = await writeClipboard(text)
    if (!succeeded) {
      showToast('error', '复制失败，请手动选择文本复制')
      return
    }

    setCopiedId(id)
    showToast('success', `${label}已复制到剪贴板`)

    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedId((current) => (current === id ? null : current))
    }, 2200)
  }

  return (
    <MotionConfig reducedMotion="user">
      <ScrollProgress />
      <TechBackground theme={theme} />
      <CardTilt />
      <div className="app" id="top">
        <Header
          nowSeconds={Math.floor(nowMs / 1000)}
          theme={theme}
          view={view}
          onToggleTheme={handleToggleTheme}
          onViewChange={handleViewChange}
        />

      <main>
        <section className="hero">
          <div className="hero-main">
            <p className="kicker">
              <span className="kicker-mark" aria-hidden="true" />
              DEVICE AUTH / MQTT {ONENET_VERSION}
            </p>
            <h1>
              <span className="h1-brand">OneNET</span> Token Generator
            </h1>
            <p className="subtitle">OneNET MQTT 设备鉴权凭证生成工具</p>
            <p className="intro">
              输入产品 ID、设备名称与设备密钥，在浏览器本地完成 HMAC
              签名，得到可直接用于 MQTT 连接的 Token、连接参数，以及 C / AT
              串口发送格式。
            </p>
            <div className="fact-row">
              <span className="fact">
                <span className="fact-dot" aria-hidden="true" />
                HMAC-SHA1 / SHA256 / MD5
              </span>
              <span className="fact">协议 {ONENET_VERSION}</span>
              <span className="fact">零后端 · 零存储</span>
              <a
                className="fact fact-link"
                href="#data-comm"
                onClick={(event) => {
                  event.preventDefault()
                  handleViewChange('data')
                }}
              >
                数据通信报文 →
              </a>
            </div>
          </div>

          <motion.aside
            className="hero-schematic"
            aria-label="签名原文结构"
            style={{ y: reduceMotion ? 0 : schematicY }}
          >
            <span className="schematic-label">STRING FOR SIGNATURE</span>
            <ol>
              <li>
                <b>et</b>
                <span>Unix 秒 + 有效期</span>
              </li>
              <li>
                <b>method</b>
                <span>sha1 / sha256 / md5</span>
              </li>
              <li>
                <b>res</b>
                <span>{'products/{产品ID}/devices/{设备名称}'}</span>
              </li>
              <li>
                <b>version</b>
                <span>{ONENET_VERSION}</span>
              </li>
            </ol>
            <p className="schematic-note">
              4 行以 <code>\n</code> 连接 → HMAC → Base64 → URL 编码
            </p>
          </motion.aside>
        </section>

        <DataForge mode={view} />

        <div className="view-stage" id="view-stage">
          <section
            className="view-screen token-view"
            id="token-screen"
            ref={tokenScreenRef}
            hidden={view !== 'token'}
            aria-hidden={view !== 'token'}
            inert={view !== 'token'}
            onBlurCapture={handleFieldBlur}
            onClickCapture={handleTokenClick}
          >
            <div className="console">
              <div className="left-col">
                <DeviceForm
                  form={form}
                  errors={errors}
                  showKey={showKey}
                  keyAutoCleared={keyAutoCleared}
                  generating={generating}
                  justGenerated={justGenerated}
                  previewEt={previewEt}
                  onChange={handleChange}
                  onToggleKey={handleToggleKey}
                  onClearKey={handleClearKey}
                  onSubmit={handleSubmit}
                  onReset={handleReset}
                />
                <SecurityNote />
              </div>

              <div className="result-col">
                <ResultPanel
                  key={result?.token ?? 'empty'}
                  result={result}
                  nowMs={nowMs}
                  isStale={isStale}
                  copiedId={copiedId}
                  onCopy={(id, text, label) => {
                    void handleCopy(id, text, label)
                  }}
                  onRegenerate={() => {
                    void generateToken()
                  }}
                />
              </div>
            </div>
          </section>

          <section
            className="view-screen data-view"
            id="data-screen"
            ref={dataScreenRef}
            hidden={view !== 'data'}
            aria-hidden={view !== 'data'}
            inert={view !== 'data'}
            onBlurCapture={handleFieldBlur}
            onClickCapture={handleDataClick}
          >
            <DataCommPanel
              productId={form.productId}
              deviceName={form.deviceName}
              copiedId={copiedId}
              onCopy={(id, text, label) => {
                void handleCopy(id, text, label)
              }}
            />
          </section>
        </div>
      </main>

      <footer className="site-footer">
        <div className="footer-brand">
          <BrandMark size={22} />
          <span>OneNET Token Generator</span>
          <span className="footer-sep">/</span>
          <span>非官方本地工具</span>
        </div>

        <nav className="footer-links" aria-label="相关链接">
          <a
            href="https://iot.10086.cn/"
            target="_blank"
            rel="noreferrer noopener"
          >
            OneNET 官网
            <ExternalLinkIcon size={12} />
          </a>
          <a
            href="https://iot.10086.cn/doc/iot_platform/book/device-connect&manager/device-auth.html"
            target="_blank"
            rel="noreferrer noopener"
          >
            官方鉴权文档
            <ExternalLinkIcon size={12} />
          </a>
        </nav>

        <p className="footer-note">
          全部计算在浏览器内完成 · 协议 {ONENET_VERSION} · 无账号 / 无后端 /
          无第三方请求
        </p>
      </footer>

        <Toast toast={toast} />
      </div>
    </MotionConfig>
  )
}
