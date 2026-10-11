import { afterAll, afterEach } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
import { removeTempDirs } from './temp-dir'

// Unmounts every wrapper created by mount/shallowMount after each test.
enableAutoUnmount(afterEach)
afterAll(removeTempDirs)
