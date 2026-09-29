'use client'
import { createContext, ReactNode, useCallback, useContext, useState } from 'react'

type Tip = { node: ReactNode; x: number; y: number }
type Ctx = { show: (node: ReactNode, e: { clientX: number; clientY: number }) => void; hide: () => void }

const TipCtx = createContext<Ctx>({ show: () => {}, hide: () => {} })

const W = 330
const GAP = 16

export function TooltipHost({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<Tip | null>(null)

  const show = useCallback((node: ReactNode, e: { clientX: number; clientY: number }) => {
    // flip to the side that has room instead of overflowing the window
    const x = e.clientX + GAP + W > window.innerWidth ? e.clientX - GAP - W : e.clientX + GAP
    const y = Math.min(e.clientY + GAP, Math.max(8, window.innerHeight - 360))
    setTip({ node, x, y })
  }, [])
  const hide = useCallback(() => setTip(null), [])

  return (
    <TipCtx.Provider value={{ show, hide }}>
      {children}
      {tip && (
        <div className="tip" style={{ left: tip.x, top: tip.y, width: W }} role="tooltip">
          {tip.node}
        </div>
      )}
    </TipCtx.Provider>
  )
}

/** `{...tip(<Content />)}` on the props of the triggering element. */
export function useTip() {
  const { show, hide } = useContext(TipCtx)
  return useCallback(
    (node: ReactNode) =>
      node
        ? {
            onMouseEnter: (e: React.MouseEvent) => show(node, e),
            onMouseMove: (e: React.MouseEvent) => show(node, e),
            onMouseLeave: hide,
          }
        : {},
    [show, hide],
  )
}
