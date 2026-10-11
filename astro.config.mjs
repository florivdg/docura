// @ts-check
import { defineConfig } from 'astro/config'

import vue from '@astrojs/vue'
import node from '@astrojs/node'
import tailwindcss from '@tailwindcss/vite'
import { loadEnv } from 'vite'

// Astro's dev module runner needs server settings in the process environment.
// Preserve explicit environment overrides when loading local .env files.
for (const [key, value] of Object.entries(
  loadEnv(process.env.NODE_ENV || 'development', process.cwd(), ''),
)) {
  if (process.env[key] === undefined) process.env[key] = value
}

// https://astro.build/config
export default defineConfig({
  integrations: [vue()],

  adapter: node({
    mode: 'standalone',
  }),

  output: 'server',

  // Behind the TLS proxy (Caddy) the app itself speaks HTTP. Trusting the
  // proxy's X-Forwarded-Proto/Host for https makes Astro.url and its origin
  // check see the public https origin; otherwise every multipart upload is
  // rejected as a cross-site form post. Only the proxy's ports are published.
  security: {
    allowedDomains: [{ protocol: 'https' }],
  },

  vite: {
    plugins: [tailwindcss()],
    server: {
      allowedHosts: ['docura.local'],
    },
    ssr: {
      external: ['bun'],
    },
    build: {
      rolldownOptions: {
        external: ['bun'],
      },
    },
  },
})
