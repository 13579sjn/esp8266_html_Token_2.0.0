import { useEffect } from 'react'

const TILT_SELECTOR = '.form-panel, .comm-input-card'

/**
 * 纯显示层的鼠标 3D 倾斜控制器。
 * 不读取、不修改任何表单状态或 Token 数据，只为命中的卡片写入 CSS 变量。
 */
export function CardTilt() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

    let current: HTMLElement | null = null
    let frame = 0
    let lastX = 0
    let lastY = 0

    function reset(element: HTMLElement | null) {
      if (!element) return
      element.classList.remove('is-tilting')
      element.style.removeProperty('--tilt-rx')
      element.style.removeProperty('--tilt-ry')
      element.style.removeProperty('--tilt-glow-x')
      element.style.removeProperty('--tilt-glow-y')
    }

    function findSurface(target: EventTarget | null): HTMLElement | null {
      if (!(target instanceof Element)) return null
      return target.closest<HTMLElement>(TILT_SELECTOR)
    }

    function applyTilt() {
      frame = 0
      if (!current) return
      const rect = current.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      const px = Math.min(1, Math.max(0, (lastX - rect.left) / rect.width))
      const py = Math.min(1, Math.max(0, (lastY - rect.top) / rect.height))

      // 最大约 3.2° / 4° 的轻微倾斜，避免文字变形和输入误触。
      current.style.setProperty('--tilt-rx', `${((0.5 - py) * 3.2).toFixed(2)}deg`)
      current.style.setProperty('--tilt-ry', `${((px - 0.5) * 4).toFixed(2)}deg`)
      current.style.setProperty('--tilt-glow-x', `${(px * 100).toFixed(1)}%`)
      current.style.setProperty('--tilt-glow-y', `${(py * 100).toFixed(1)}%`)
    }

    function requestTilt() {
      if (!frame) frame = window.requestAnimationFrame(applyTilt)
    }

    function handlePointerMove(event: PointerEvent) {
      if (event.pointerType === 'touch') return
      const next = findSurface(event.target)

      if (current && next !== current) {
        reset(current)
        current = null
      }

      if (!next) return

      if (current !== next) {
        current = next
        current.classList.add('is-tilting')
      }

      lastX = event.clientX
      lastY = event.clientY
      requestTilt()
    }

    function clearTilt() {
      if (frame) {
        window.cancelAnimationFrame(frame)
        frame = 0
      }
      reset(current)
      current = null
    }

    function handlePointerDown(event: PointerEvent) {
      if (!current) return
      if (!(event.target instanceof Node) || !current.contains(event.target)) {
        clearTilt()
      }
    }

    document.addEventListener('pointermove', handlePointerMove, { passive: true })
    document.addEventListener('pointerdown', handlePointerDown, { passive: true })
    document.documentElement.addEventListener('pointerleave', clearTilt)
    window.addEventListener('blur', clearTilt)
    window.addEventListener('scroll', clearTilt, { passive: true })

    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerdown', handlePointerDown)
      document.documentElement.removeEventListener('pointerleave', clearTilt)
      window.removeEventListener('blur', clearTilt)
      window.removeEventListener('scroll', clearTilt)
      clearTilt()
    }
  }, [])

  return null
}
