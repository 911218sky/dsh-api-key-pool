/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  SETTINGS_NAV_MARKER,
  installNavIconStyles,
  registerSettingsNavIcon,
  syncSettingsNavMarkers,
} from '../src/client/settings-nav-icon.ts'

function mountSettingsDialog(labels: string[]): {
  dialog: HTMLElement
  buttons: HTMLButtonElement[]
} {
  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'dialog')
  const nav = document.createElement('nav')
  const buttons: HTMLButtonElement[] = []
  for (const label of labels) {
    const button = document.createElement('button')
    button.textContent = label
    nav.appendChild(button)
    buttons.push(button)
  }
  dialog.appendChild(nav)
  document.body.appendChild(dialog)
  return { dialog, buttons }
}

afterEach(() => {
  document.body.innerHTML = ''
  document.head.querySelectorAll('style').forEach((el) => el.remove())
})

describe('syncSettingsNavMarkers', () => {
  it('marks the matching label and clears others', () => {
    const { buttons } = mountSettingsDialog(['General', 'API Key Pool', 'About'])
    syncSettingsNavMarkers(document, 'API Key Pool')
    expect(buttons[0]!.hasAttribute(SETTINGS_NAV_MARKER)).toBe(false)
    expect(buttons[1]!.hasAttribute(SETTINGS_NAV_MARKER)).toBe(true)
    expect(buttons[2]!.hasAttribute(SETTINGS_NAV_MARKER)).toBe(false)
  })

  it('prefers aria-label over text content', () => {
    const { buttons } = mountSettingsDialog(['wrong text'])
    buttons[0]!.setAttribute('aria-label', 'API Key Pool')
    syncSettingsNavMarkers(document, 'API Key Pool')
    expect(buttons[0]!.hasAttribute(SETTINGS_NAV_MARKER)).toBe(true)
  })
})

describe('installNavIconStyles', () => {
  it('injects and removes a style element', () => {
    const dispose = installNavIconStyles(document)
    expect(document.head.querySelector(`style`)?.textContent).toContain(SETTINGS_NAV_MARKER)
    dispose()
    expect(document.head.querySelector('style')).toBeNull()
  })
})

describe('registerSettingsNavIcon', () => {
  it('marks on register and clears on dispose', () => {
    const { buttons } = mountSettingsDialog(['API Key Pool'])
    const dispose = registerSettingsNavIcon(() => 'API Key Pool', document)
    expect(buttons[0]!.hasAttribute(SETTINGS_NAV_MARKER)).toBe(true)
    dispose()
    expect(buttons[0]!.hasAttribute(SETTINGS_NAV_MARKER)).toBe(false)
  })

  it('re-sync when a matching button appears', async () => {
    const { dialog } = mountSettingsDialog(['General'])
    const dispose = registerSettingsNavIcon(() => 'API Key Pool', document)
    const button = document.createElement('button')
    button.textContent = 'API Key Pool'
    dialog.querySelector('nav')!.appendChild(button)
    // Debounced MutationObserver path (64ms).
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(button.hasAttribute(SETTINGS_NAV_MARKER)).toBe(true)
    dispose()
  })
})
