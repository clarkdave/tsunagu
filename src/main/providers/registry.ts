import type { Provider } from './types'
import type { SourceType } from '../../shared/types'
import { PayPayProvider } from './paypay'

const providers: Record<string, Provider> = {
  paypay: new PayPayProvider()
}

export function getProvider(type: SourceType): Provider {
  const provider = providers[type]
  if (!provider) throw new Error(`No provider for source type: ${type}`)
  return provider
}
