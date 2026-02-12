import { type ComputedRef, onUnmounted, type Ref, ref, watch } from 'vue'

import type { ProcessingNotification } from '@/worker/types'

const RECONNECT_DELAY_MS = 3000

interface UseProcessingEventsOptions {
  enabled?: Ref<boolean> | ComputedRef<boolean>
}

export function useProcessingEvents(
  onUpdate: (event: ProcessingNotification) => void,
  options?: UseProcessingEventsOptions,
) {
  const connected = ref(false)
  let eventSource: EventSource | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  const enabled = options?.enabled

  function connect() {
    if (eventSource) return

    eventSource = new EventSource('/api/events/processing')

    eventSource.onopen = () => {
      connected.value = true
    }

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'connected') return
        onUpdate(data as ProcessingNotification)
      } catch {
        // Ignore malformed messages
      }
    }

    eventSource.onerror = () => {
      connected.value = false
      disconnect()
      if (!enabled || enabled.value) {
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS)
      }
    }
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    connected.value = false
  }

  if (enabled) {
    watch(
      enabled,
      (isEnabled) => {
        if (isEnabled) {
          connect()
        } else {
          disconnect()
        }
      },
      { immediate: true },
    )
  } else {
    connect()
  }

  onUnmounted(() => {
    disconnect()
  })

  return { connected }
}
