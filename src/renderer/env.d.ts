import type { TsunaguAPI } from '../shared/types'

declare global {
  interface Window {
    api: TsunaguAPI
  }
}
