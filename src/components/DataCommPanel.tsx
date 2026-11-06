import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { gsap } from 'gsap'

import { SAMPLE_DOWNLINK_PAYLOAD } from '../lib/dataMessages'
import { DownlinkBuilder } from './DownlinkBuilder'
import { ReceiveReply } from './ReceiveReply'
import { UploadBuilder } from './UploadBuilder'
import { ChevronRightIcon } from './Icons'

type TabKey = 'upload' | 'downlink' | 'receive'

const TABS: readonly {
  key: TabKey
  label: string
  tag: string
}[] = [
  { key: 'upload', label: '设备数据上报', tag: 'property/post' },
  { key: 'downlink', label: '平台指令下发', tag: 'property/set' },
  { key: 'receive', label: '设备接收与回复', tag: 'property/set_reply' },
]

const TAB_KEYS = TABS.map((tab) => tab.key)

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface DataCommPanelProps {
  productId: string
  deviceName: string
  copiedId: string | null
  onCopy: (id: string, text: string, label: string) => void
}

export function DataCommPanel({
  productId,
  deviceName,
  copiedId,
  onCopy,
}: DataCommPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('upload')
  const [receiveRaw, setReceiveRaw] = useState(SAMPLE_DOWNLINK_PAYLOAD)
  const [parseNonce, setParseNonce] = useState(0)

  const sectionRef = useRef<HTMLElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const gliderRef = useRef<HTMLSpanElement>(null)
  const panelRefs = useRef<Record<TabKey, HTMLDivElement | null>>({
    upload: null,
    downlink: null,
    receive: null,
  })
  const previousTabRef = useRef<TabKey>('upload')
  const bootedRef = useRef(false)

  const connectionReady = Boolean(productId.trim() && deviceName.trim())

  function sendToReceiver(payload: string) {
    setReceiveRaw(payload)
    setParseNonce((previous) => previous + 1)
    setActiveTab('receive')
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index
    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % TABS.length
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + TABS.length) % TABS.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = TABS.length - 1
    } else {
      return
    }

    event.preventDefault()
    const next = TABS[nextIndex]
    setActiveTab(next.key)
    document.getElementById(`data-tab-${next.key}`)?.focus()
  }

  function positionGlider(animate: boolean) {
    const tabs = tabsRef.current
    const glider = gliderRef.current
    const active = document.getElementById(`data-tab-${activeTab}`)
    if (!tabs || !glider || !active) return

    const next = {
      x: active.offsetLeft + 12,
      width: Math.max(0, active.offsetWidth - 24),
    }

    if (!animate || prefersReducedMotion()) {
      gsap.set(glider, { ...next, autoAlpha: 1 })
      return
    }

    gsap.to(glider, {
      ...next,
      autoAlpha: 1,
      duration: 0.46,
      ease: 'power3.out',
      overwrite: true,
    })
  }

  // 屏幕标签的滑动指示器。
  useLayoutEffect(() => {
    positionGlider(true)
    const tabs = tabsRef.current
    if (tabs && tabs.scrollWidth > tabs.clientWidth + 1) {
      document
        .getElementById(`data-tab-${activeTab}`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    // 位置只依赖当前 tab；window resize 会在下面的 effect 中重算。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  useEffect(() => {
    const tabs = tabsRef.current
    if (!tabs) return
    const update = () => positionGlider(false)
    const observer = new ResizeObserver(update)
    observer.observe(tabs)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // 标签切换：新面板从对应方向滑入，卡片错峰出现。
  useLayoutEffect(() => {
    const panel = panelRefs.current[activeTab]
    if (!panel) return

    const previous = previousTabRef.current
    previousTabRef.current = activeTab

    if (!bootedRef.current || prefersReducedMotion()) return

    const direction =
      TAB_KEYS.indexOf(activeTab) >= TAB_KEYS.indexOf(previous) ? 1 : -1
    const cards = Array.from(panel.querySelectorAll<HTMLElement>('.comm-card'))

    gsap.killTweensOf(panel)
    gsap.killTweensOf(cards)
    gsap.fromTo(
      panel,
      { autoAlpha: 0, x: direction * 38 },
      {
        autoAlpha: 1,
        x: 0,
        duration: 0.44,
        ease: 'power3.out',
        clearProps: 'opacity,visibility,transform',
      },
    )
    gsap.fromTo(
      cards,
      { autoAlpha: 0, y: 18 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.46,
        stagger: 0.07,
        delay: 0.06,
        ease: 'power2.out',
        clearProps: 'opacity,visibility,transform',
      },
    )
  }, [activeTab])

  // 首次滚入视口时的屏幕启动时间线。
  useEffect(() => {
    const section = sectionRef.current
    if (!section) return

    if (prefersReducedMotion()) {
      bootedRef.current = true
      return
    }

    const header = section.querySelector<HTMLElement>('.data-comm-head')
    const screenbar = section.querySelector<HTMLElement>('.comm-screenbar')
    const context = section.querySelector<HTMLElement>('.comm-context')
    const tabs = section.querySelector<HTMLElement>('.comm-tabs')
    const activePanel = section.querySelector<HTMLElement>(
      '[role="tabpanel"]:not([hidden])',
    )
    const cards = activePanel
      ? Array.from(activePanel.querySelectorAll<HTMLElement>('.comm-card'))
      : []
    const targets = [section, header, screenbar, context, tabs, ...cards].filter(
      (target): target is HTMLElement => Boolean(target),
    )

    let timeline: ReturnType<typeof gsap.timeline> | null = null
    let observer: IntersectionObserver | null = null
    let played = false

    gsap.set(section, { autoAlpha: 0, y: 26 })

    const play = () => {
      if (played) return
      played = true
      observer?.disconnect()

      const tl = gsap.timeline({
        defaults: { ease: 'power3.out' },
        onComplete: () => {
          bootedRef.current = true
        },
      })
      timeline = tl

      tl.fromTo(
        section,
        { autoAlpha: 0, y: 26 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.45,
          clearProps: 'opacity,visibility,transform',
        },
      )
        .fromTo(
          header,
          { autoAlpha: 0, y: 14 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.3,
            clearProps: 'opacity,visibility,transform',
          },
          '-=0.22',
        )
        .fromTo(
          screenbar,
          { autoAlpha: 0, y: -8 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.26,
            clearProps: 'opacity,visibility,transform',
          },
          '-=0.2',
        )
        .fromTo(
          context,
          { autoAlpha: 0, y: 10 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.26,
            clearProps: 'opacity,visibility,transform',
          },
          '-=0.18',
        )
        .fromTo(
          tabs,
          { autoAlpha: 0, y: 8 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.24,
            clearProps: 'opacity,visibility,transform',
          },
          '-=0.16',
        )
        .fromTo(
          cards,
          { autoAlpha: 0, y: 20 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.32,
            stagger: 0.05,
            clearProps: 'opacity,visibility,transform',
          },
          '-=0.12',
        )
    }

    if (typeof IntersectionObserver === 'undefined') {
      play()
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) play()
        },
        { threshold: 0.08 },
      )
      observer.observe(section)
    }

    return () => {
      observer?.disconnect()
      timeline?.kill()
      gsap.killTweensOf(targets)
      gsap.set(targets, { clearProps: 'opacity,visibility,transform' })
    }
  }, [])

  // 复制按钮的轻微按压反馈，只影响按钮视觉。
  useEffect(() => {
    const section = sectionRef.current
    if (!section || prefersReducedMotion()) return

    const handleDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return
      const button = event.target.closest('.copy-inline')
      if (!button || !section.contains(button)) return
      gsap.fromTo(
        button,
        { scale: 0.94 },
        { scale: 1, duration: 0.28, ease: 'back.out(2)' },
      )
    }

    section.addEventListener('pointerdown', handleDown, { passive: true })
    return () => section.removeEventListener('pointerdown', handleDown)
  }, [])

  return (
    <section
      className="panel data-comm"
      id="data-comm"
      aria-labelledby="data-comm-title"
      ref={sectionRef}
    >
      <div className="panel-head data-comm-head">
        <div>
          <span className="panel-index">03 / DATA LINK</span>
          <h2 id="data-comm-title">数据通信报文</h2>
          <p>依据 c语言格式 中的 TXT 构造、解析与校验属性报文</p>
        </div>
        <span className="panel-tag">MQTT PAYLOAD LAB</span>
      </div>

      <div className="comm-screenbar" aria-hidden="true">
        <span className="comm-screenbar-left">
          <span className="comm-led" />
          DATA LINK / SCREEN 03
        </span>
        <span className="comm-screenbar-mid">
          PROPERTY POST · SET · SET_REPLY
        </span>
        <span className="comm-screenbar-right">LOCAL · READY</span>
      </div>

      <div className="comm-context">
        <div className="comm-context-fields">
          <div>
            <span className="micro">CLIENT ID / 设备名称</span>
            <code>{deviceName.trim() || '未填写'}</code>
          </div>
          <div>
            <span className="micro">USERNAME / 产品 ID</span>
            <code>{productId.trim() || '未填写'}</code>
          </div>
        </div>
        <span className={`comm-ready${connectionReady ? ' is-ok' : ' is-warn'}`}>
          {connectionReady
            ? 'Topic 使用上方当前连接参数'
            : '缺少产品 ID / 设备名称，Topic 将使用占位符'}
        </span>
      </div>

      <div className="comm-tabs" role="tablist" aria-label="数据通信功能" ref={tabsRef}>
        {TABS.map((tab, index) => (
          <button
            key={tab.key}
            id={`data-tab-${tab.key}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`data-panel-${tab.key}`}
            tabIndex={activeTab === tab.key ? 0 : -1}
            className={`comm-tab${activeTab === tab.key ? ' is-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
            onKeyDown={(event) => handleTabKey(event, index)}
          >
            <span className="comm-tab-label">{tab.label}</span>
            <span className="comm-tab-tag">{tab.tag}</span>
          </button>
        ))}
        <span className="comm-tab-glider" ref={gliderRef} aria-hidden="true" />
      </div>

      <div
        id="data-panel-upload"
        role="tabpanel"
        aria-labelledby="data-tab-upload"
        hidden={activeTab !== 'upload'}
        ref={(element) => {
          panelRefs.current.upload = element
        }}
      >
        <UploadBuilder
          productId={productId}
          deviceName={deviceName}
          copiedId={copiedId}
          onCopy={onCopy}
        />
      </div>

      <div
        id="data-panel-downlink"
        role="tabpanel"
        aria-labelledby="data-tab-downlink"
        hidden={activeTab !== 'downlink'}
        ref={(element) => {
          panelRefs.current.downlink = element
        }}
      >
        <DownlinkBuilder
          productId={productId}
          deviceName={deviceName}
          copiedId={copiedId}
          onCopy={onCopy}
          onSendToReceiver={sendToReceiver}
        />
      </div>

      <div
        id="data-panel-receive"
        role="tabpanel"
        aria-labelledby="data-tab-receive"
        hidden={activeTab !== 'receive'}
        ref={(element) => {
          panelRefs.current.receive = element
        }}
      >
        <ReceiveReply
          raw={receiveRaw}
          onRawChange={setReceiveRaw}
          parseNonce={parseNonce}
          productId={productId}
          deviceName={deviceName}
          copiedId={copiedId}
          onCopy={onCopy}
        />
      </div>

      <div className="comm-disclaimer">
        本页只构造、解析和校验报文，不会连接 OneNET，也不会向真实设备发送数据。
        实际通信仍需由 ESP8266 / STM32 端执行。
      </div>

      <details className="comm-sources">
        <summary>
          <span>协议依据与不确定性说明</span>
          <ChevronRightIcon size={15} className="comm-sources-chevron" />
        </summary>
        <div className="comm-sources-body">
          <ul>
            <li>
              <b>上发.txt（最新）</b>
              <span>
                两条可直接发送的 property/post AT 指令：LED=true 与 count=33；
                页面默认上报与示例均与这两条命令逐字符对齐。
              </span>
            </li>
            <li>
              <b>C语言代码格式.txt</b>
              <span>
                property/post 的 count / DHT11 / CO2 示例（%d、%.2f）；
                property/set_reply 的 id / code=200 / msg=success 回复；
                注释要求先回复、再执行业务逻辑。
              </span>
            </li>
            <li>
              <b>解析onenet下发的内容.txt</b>
              <span>
                extract_mqtt_info() 的字段提取规则：从第一个 {'{'} 开始，只取
                params 下第一个字段；id 缓冲 64 字节，标识符 / value 缓冲 32 字节。
              </span>
            </li>
            <li>
              <b>回复的格式.txt</b>
              <span>
                set_reply 回复结构与 true/1、false/0 业务判断；回复固定 code=200、
                msg=success。
              </span>
            </li>
          </ul>
          <p>
            不确定项：TXT 没有完整平台下发样例，因此“平台指令下发”只生成解析器所需的
            id + params 最小结构，未添加 version 等字段；TXT 没有字符串 / 十六进制类型
            示例，因此未提供对应选项；TXT 解析器不解析嵌套 JSON，页面单独展示的结构化
            value 仅用于调试。AT 指令的引号 / 逗号转义按 TXT 原样复现，未在真实 ESP-AT
            上逐字节回放。
          </p>
        </div>
      </details>
    </section>
  )
}
