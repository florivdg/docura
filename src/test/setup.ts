import { afterEach } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'

// Unmounts every wrapper created by mount/shallowMount after each test.
enableAutoUnmount(afterEach)
