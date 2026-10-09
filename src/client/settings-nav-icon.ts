/**
 * Settings left-nav icon workaround: DSH has no icon field on `settings.section`,
 * so we mark our nav button and paint a key glyph via CSS mask.
 *
 * Upstream permanent fix: an icon/slot API on `settings.section`. Until then
 * this observer must stay scoped and debounced.
 */

export const SETTINGS_NAV_LABEL = 'API Key Pool'
export const SETTINGS_NAV_MARKER = 'data-dsh-api-key-pool-settings-nav'

/** Lucide `key-round` — painted as a currentColor mask on the settings nav row. */
export const NAV_ICON_MASK =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z'/%3E%3Ccircle cx='16.5' cy='7.5' r='.5' fill='black'/%3E%3C/svg%3E\")"

const SYNC_DEBOUNCE_MS = 64

export function installNavIconStyles(
  doc: Document = document,
): () => void {
  const css = doc.createElement('style')
  css.textContent = `
    [${SETTINGS_NAV_MARKER}] > svg:first-child { display: none; }
    [${SETTINGS_NAV_MARKER}]::before {
      content: ''; flex: none; width: 16px; height: 16px;
      background: currentColor;
      -webkit-mask: ${NAV_ICON_MASK} center / contain no-repeat;
      mask: ${NAV_ICON_MASK} center / contain no-repeat;
    }
  `
  doc.head.appendChild(css)
  return () => css.remove()
}

function buttonMatchesLabel(button: HTMLButtonElement, label: string): boolean {
  if (label.length === 0) return false
  const aria = button.getAttribute('aria-label')?.trim()
  if (aria !== undefined && aria.length > 0) return aria === label
  return button.textContent?.trim() === label
}

/** Sync marker attributes onto settings-nav buttons under the given root. */
export function syncSettingsNavMarkers(
  root: ParentNode,
  label: string,
): void {
  const buttons = root.querySelectorAll<HTMLButtonElement>(
    '[role="dialog"] nav button, nav button',
  )
  for (const button of buttons) {
    if (buttonMatchesLabel(button, label)) {
      button.setAttribute(SETTINGS_NAV_MARKER, '')
    } else {
      button.removeAttribute(SETTINGS_NAV_MARKER)
    }
  }
}

function settingsDialogRoot(doc: Document): Element | null {
  return doc.querySelector('[role="dialog"]')
}

/**
 * Mark our Settings nav row so CSS can swap the fallback gear for a key icon.
 * Observes the open dialog when present; falls back to `document.body`.
 */
export function registerSettingsNavIcon(
  label: () => string,
  doc: Document = document,
): () => void {
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let observer: MutationObserver | null = null
  let observed: Node | null = null

  const runSync = (): void => {
    if (disposed) return
    syncSettingsNavMarkers(doc, label().trim())
  }

  const scheduleSync = (): void => {
    if (disposed) return
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      retargetObserver()
      runSync()
    }, SYNC_DEBOUNCE_MS)
  }

  const retargetObserver = (): void => {
    if (disposed || observer === null) return
    const preferred = settingsDialogRoot(doc) ?? doc.body
    if (preferred === observed) return
    observer.disconnect()
    observed = preferred
    observer.observe(preferred, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  }

  runSync()
  observer = new MutationObserver(scheduleSync)
  retargetObserver()

  return () => {
    disposed = true
    if (timer !== null) clearTimeout(timer)
    observer?.disconnect()
    observer = null
    observed = null
    doc.querySelectorAll(`[${SETTINGS_NAV_MARKER}]`).forEach((el) => {
      el.removeAttribute(SETTINGS_NAV_MARKER)
    })
  }
}
