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

  const current = normalizePath(currentPath)
  const target = normalizePath(item.url)

  if (item.exact) return current === target
  if (target === '/') return current === '/'

  return current === target || current.startsWith(`${target}/`)
}
