export type ForgeActionKind = 'field' | 'generate' | 'data' | 'switch'

export interface ForgeActionDetail {
  kind: ForgeActionKind
  label?: string
}

const FORGE_EVENT = 'onenet:forge-action'

/** 纯显示层事件：把表单/报文动作转成 3D 装配线的动作，不参与任何业务计算。 */
export function emitForgeAction(kind: ForgeActionKind, label?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<ForgeActionDetail>(FORGE_EVENT, {
      detail: { kind, label },
    }),
  )
}

export function onForgeAction(
  handler: (detail: ForgeActionDetail) => void,
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<ForgeActionDetail>).detail
    if (detail) handler(detail)
  }
  window.addEventListener(FORGE_EVENT, listener)
  return () => window.removeEventListener(FORGE_EVENT, listener)
}
