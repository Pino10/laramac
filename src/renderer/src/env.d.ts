import type { LaramacApi } from '@shared/types'

declare global {
  interface Window {
    laramac: LaramacApi
  }
}

export {}
