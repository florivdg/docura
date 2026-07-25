// @ts-check
import { defineConfig } from 'astro/config'

import vue from '@astrojs/vue'
import node from '@astrojs/node'
import tailwindcss from '@tailwindcss/vite'

// https://astro.build/config
export default defineConfig({
  integrations: [vue()],

  adapter: node({
    mode: 'standalone',
  }),

  output: 'server',

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
