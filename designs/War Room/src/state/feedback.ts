import { reactive } from 'vue'

/**
 * App-wide feedback: transient toasts (with an optional action such as Undo) and
 * a promise-based confirm dialog for destructive actions.
 */
export interface Toast {
  id: number
  message: string
  action?: { label: string; run: () => void }
}

export const feedback = reactive({
  toasts: [] as Toast[],
  confirm: null as null | { title: string; message: string; confirmLabel: string; resolve: (ok: boolean) => void },
})

let nextId = 1

export function toast(message: string, action?: Toast['action'], ms = 5000) {
  const t: Toast = { id: nextId++, message, action }
  feedback.toasts.push(t)
  if (feedback.toasts.length > 3) feedback.toasts.shift()
  setTimeout(() => dismiss(t.id), ms)
}

export function dismiss(id: number) {
  const i = feedback.toasts.findIndex((t) => t.id === id)
  if (i >= 0) feedback.toasts.splice(i, 1)
}

export function confirmAction(title: string, message: string, confirmLabel = 'Delete'): Promise<boolean> {
  feedback.confirm?.resolve(false)
  return new Promise((resolve) => {
    feedback.confirm = {
      title,
      message,
      confirmLabel,
      resolve: (ok) => {
        feedback.confirm = null
        resolve(ok)
      },
    }
  })
}
