import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Modal } from '../components/Modal'

export interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

interface ConfirmState {
  options: ConfirmOptions
  resolve: (result: boolean) => void
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null)
  const stateRef = useRef<ConfirmState | null>(null)
  stateRef.current = state

  const close = useCallback((result: boolean) => {
    const current = stateRef.current
    if (!current) return
    stateRef.current = null
    current.resolve(result)
    setState(null)
  }, [])

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      const previous = stateRef.current
      if (previous) {
        previous.resolve(false)
      }
      const next = { options, resolve }
      stateRef.current = next
      setState(next)
    })
  }, [])

  const value = useMemo(() => ({ confirm }), [confirm])
  const options = state?.options

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={options?.title ?? ''}
        size="sm"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => close(false)}>
              {options?.cancelText ?? '取消'}
            </button>
            <button
              className={`btn ${options?.danger ? 'btn-danger' : 'btn-primary'}`}
              onClick={() => close(true)}
            >
              {options?.confirmText ?? '确定'}
            </button>
          </>
        }
      >
        <div className="confirm-message">{options?.message}</div>
      </Modal>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmContextValue {
  const context = useContext(ConfirmContext)
  if (!context) throw new Error('useConfirm 必须在 ConfirmProvider 内使用')
  return context
}
