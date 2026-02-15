import type { Component } from 'vue'

export interface NavItem {
  title: string
  url: string
  icon?: Component
  exact?: boolean
}

function normalizePath(path: string) {
  if (!path) return '/'
  if (path === '/') return '/'
  return path.endsWith('/') ? path.slice(0, -1) : path
}

export function isNavItemActive(item: NavItem, currentPath: string) {
  if (!item.url || item.url === '#') return false

  // Separate path and query from item.url
  const [itemPath, itemQuery] = item.url.split('?')
  const current = normalizePath(currentPath)
  const target = normalizePath(itemPath)

  // Path matching
  let pathMatch: boolean
  if (item.exact) {
    pathMatch = current === target
  } else if (target === '/') {
    pathMatch = current === '/'
  } else {
    pathMatch = current === target || current.startsWith(`${target}/`)
  }

  if (!pathMatch) return false

  // If item URL has query params, verify they all exist in the current URL
  if (itemQuery) {
    const itemParams = new URLSearchParams(itemQuery)
    const currentParams = new URLSearchParams(
      typeof window !== 'undefined' ? window.location.search : '',
    )
    for (const [key, value] of itemParams) {
      if (currentParams.get(key) !== value) return false
    }
    return true
  }

  // If item URL has no query params and is exact, only match when no extra params
  if (item.exact) {
    const currentSearch =
      typeof window !== 'undefined' ? window.location.search : ''
    return !currentSearch
  }

  return true
}
