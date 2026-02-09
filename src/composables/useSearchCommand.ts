import { ref } from 'vue'

const isSearchOpen = ref(false)

export function useSearchCommand() {
  return {
    isSearchOpen,
    openSearch: () => {
      isSearchOpen.value = true
    },
  }
}
