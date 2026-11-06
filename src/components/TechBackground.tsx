import { useEffect, useRef } from 'react'

import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  TorusKnotGeometry,
  WebGLRenderer,
  WireframeGeometry,
} from 'three'
import type { Material } from 'three'

import type { ThemeMode } from './Header'

interface TechBackgroundProps {
  theme: ThemeMode
}

/**
 * Three.js 科技背景：3D 节点网络、线框数据核心、轨道环与粒子尘埃。
 * 固定在整个视口后方，pointer-events: none；不影响任何表单或业务逻辑。
 * 尊重 prefers-reduced-motion，页面隐藏时暂停渲染。
 */
export function TechBackground({ theme }: TechBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const dark = theme === 'dark'
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    container.insertBefore(canvas, container.firstChild)

    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({
        canvas,
        alpha: true,
        antialias: window.innerWidth > 720,
        powerPreference: 'high-performance',
      })
    } catch {
      if (canvas.parentNode === container) container.removeChild(canvas)
      return
    }

    let width = window.innerWidth
    let height = window.innerHeight
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)

    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(width, height, false)
    renderer.setClearColor(0x000000, 0)

    const scene = new Scene()
    const camera = new PerspectiveCamera(48, width / height, 0.1, 100)
    camera.position.set(0, 0, 10)

    const teal = new Color(dark ? 0x52d3b4 : 0x0e6b58)
    const accent = new Color(dark ? 0xe0bd72 : 0x8a6417)
    const lineAlpha = dark ? 0.28 : 0.12
    const nodeAlpha = dark ? 0.9 : 0.58
    const narrow = width < 720
    const objectScale = narrow ? 0.68 : 1

    // 3D 节点网络
    const network = new Group()
    const nodeCount = narrow ? 42 : 78
    const nodePositions: number[] = []
    const nodes: { x: number; y: number; z: number }[] = []

    for (let index = 0; index < nodeCount; index += 1) {
      const radius = 2.6 + Math.random() * 3.4
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const spread = narrow ? 0.9 : 1.25
      const x = Math.cos(theta) * Math.sin(phi) * radius * spread
      const y = Math.cos(phi) * radius * (narrow ? 0.55 : 0.78)
      const z = Math.sin(theta) * Math.sin(phi) * radius * 0.7
      nodes.push({ x, y, z })
      nodePositions.push(x, y, z)
    }

    const nodeGeometry = new BufferGeometry()
    nodeGeometry.setAttribute(
      'position',
      new Float32BufferAttribute(nodePositions, 3),
    )
    const nodeMaterial = new PointsMaterial({
      color: teal,
      size: narrow ? 0.062 : 0.05,
      transparent: true,
      opacity: nodeAlpha,
      sizeAttenuation: true,
      depthWrite: false,
    })
    network.add(new Points(nodeGeometry, nodeMaterial))

    const linkPositions: number[] = []
    for (let index = 0; index < nodes.length; index += 1) {
      for (let other = index + 1; other < nodes.length; other += 1) {
        const a = nodes[index]
        const b = nodes[other]
        const distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
        if (distance < 2.55) {
          linkPositions.push(a.x, a.y, a.z, b.x, b.y, b.z)
        }
      }
    }

    if (linkPositions.length > 0) {
      const linkGeometry = new BufferGeometry()
      linkGeometry.setAttribute(
        'position',
        new Float32BufferAttribute(linkPositions, 3),
      )
      const linkMaterial = new LineBasicMaterial({
        color: teal,
        transparent: true,
        opacity: lineAlpha,
        depthWrite: false,
      })
      network.add(new LineSegments(linkGeometry, linkMaterial))
    }

    network.position.set(0, 0, -1.6)
    scene.add(network)

    // 右侧线框核心
    const core = new Group()
    const coreGeometry = new IcosahedronGeometry(2.1, 1)
    const coreWire = new LineSegments(
      new WireframeGeometry(coreGeometry),
      new LineBasicMaterial({
        color: teal,
        transparent: true,
        opacity: dark ? 0.24 : 0.12,
        depthWrite: false,
      }),
    )
    core.add(coreWire)
    core.position.set(narrow ? 2.9 : 4.8, narrow ? -0.2 : -1.2, -2.2)
    core.scale.setScalar(objectScale)
    core.rotation.set(0.2, 0.4, 0)
    scene.add(core)
    coreGeometry.dispose()

    // 左上角轨道环
    const ring = new Group()
    const ringGeometry = new TorusKnotGeometry(1.05, 0.26, 96, 10)
    const ringWire = new LineSegments(
      new WireframeGeometry(ringGeometry),
      new LineBasicMaterial({
        color: accent,
        transparent: true,
        opacity: dark ? 0.26 : 0.12,
        depthWrite: false,
      }),
    )
    ring.add(ringWire)
    ring.position.set(narrow ? -2.7 : -5.1, narrow ? 2.2 : 2.4, -3)
    ring.scale.setScalar(objectScale)
    ring.rotation.set(0.3, -0.2, 0.15)
    scene.add(ring)
    ringGeometry.dispose()

    // 粒子尘埃
    const dustCount = narrow ? 90 : 240
    const dustPositions = new Float32Array(dustCount * 3)
    for (let index = 0; index < dustCount; index += 1) {
      dustPositions[index * 3] = (Math.random() - 0.5) * 18
      dustPositions[index * 3 + 1] = (Math.random() - 0.5) * 12
      dustPositions[index * 3 + 2] = (Math.random() - 0.5) * 8 - 2
    }
    const dustGeometry = new BufferGeometry()
    dustGeometry.setAttribute(
      'position',
      new Float32BufferAttribute(dustPositions, 3),
    )
    const dustMaterial = new PointsMaterial({
      color: accent,
      size: narrow ? 0.032 : 0.024,
      transparent: true,
      opacity: dark ? 0.42 : 0.22,
      sizeAttenuation: true,
      depthWrite: false,
    })
    const dust = new Points(dustGeometry, dustMaterial)
    scene.add(dust)

    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 }
    let scrollNorm = 0
    let running = !document.hidden
    let rafId = 0
    let lastTimestamp = 0

    function updateScroll() {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      scrollNorm = maxScroll > 0 ? Math.min(1, window.scrollY / maxScroll) : 0
    }

    function renderFrame(timestamp: number) {
      const delta = lastTimestamp ? Math.min(32, timestamp - lastTimestamp) : 16
      lastTimestamp = timestamp

      pointer.x += (pointer.targetX - pointer.x) * 0.045
      pointer.y += (pointer.targetY - pointer.y) * 0.045

      network.rotation.y = timestamp * 0.000035 + pointer.x * 0.08
      network.rotation.x = Math.sin(timestamp * 0.00009) * 0.06 + pointer.y * 0.05
      core.rotation.y += delta * 0.00032
      core.rotation.x += delta * 0.00016
      ring.rotation.z += delta * 0.00027
      ring.rotation.y += delta * 0.00012
      dust.rotation.y = timestamp * 0.000012

      camera.position.x = pointer.x * 0.34
      camera.position.y = -pointer.y * 0.24 + scrollNorm * 0.62
      camera.lookAt(0, 0, 0)

      renderer.render(scene, camera)

      if (!reduceMotion && running) {
        rafId = window.requestAnimationFrame(renderFrame)
      }
    }

    function handlePointerMove(event: PointerEvent) {
      pointer.targetX = (event.clientX / window.innerWidth - 0.5) * 2
      pointer.targetY = (event.clientY / window.innerHeight - 0.5) * 2
    }

    function handleVisibility() {
      if (document.hidden) {
        running = false
        window.cancelAnimationFrame(rafId)
        return
      }
      if (!running && !reduceMotion) {
        running = true
        lastTimestamp = 0
        rafId = window.requestAnimationFrame(renderFrame)
      }
    }

    function handleResize() {
      width = window.innerWidth
      height = window.innerHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
      renderer.setSize(width, height, false)
      updateScroll()
      if (reduceMotion) renderer.render(scene, camera)
    }

    if (!reduceMotion) {
      window.addEventListener('pointermove', handlePointerMove, { passive: true })
      window.addEventListener('scroll', updateScroll, { passive: true })
      document.addEventListener('visibilitychange', handleVisibility)
    }
    window.addEventListener('resize', handleResize)
    updateScroll()
    renderer.render(scene, camera)
    if (!reduceMotion) {
      rafId = window.requestAnimationFrame(renderFrame)
    }

    return () => {
      running = false
      window.cancelAnimationFrame(rafId)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('scroll', updateScroll)
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('visibilitychange', handleVisibility)

      scene.traverse((object) => {
        const disposable = object as {
          geometry?: BufferGeometry
          material?: Material | Material[]
        }
        disposable.geometry?.dispose()
        if (Array.isArray(disposable.material)) {
          disposable.material.forEach((material) => material.dispose())
        } else {
          disposable.material?.dispose()
        }
      })
      renderer.forceContextLoss()
      renderer.dispose()
      if (canvas.parentNode === container) container.removeChild(canvas)
    }
  }, [theme])

  return (
    <div className="tech-background" aria-hidden="true" ref={containerRef}>
      <span className="tech-scan" />
    </div>
  )
}
