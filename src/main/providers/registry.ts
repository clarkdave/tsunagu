import type { Provider } from './types'
import type { SourceType } from '../../shared/types'
import { PayPayProvider } from './paypay'
import { AmexJapanProvider } from './amex-japan'
import { JPPostBankProvider } from './jp-post-bank'
import { SBIShinseiProvider } from './sbi-shinsei'

const providers: Record<string, Provider> = {
  'paypay': new PayPayProvider(),
  'amex-japan': new AmexJapanProvider(),
  'jp-post-bank': new JPPostBankProvider(),
  'sbi-shinsei': new SBIShinseiProvider()
}

export function getProvider(type: SourceType): Provider {
  const provider = providers[type]
  if (!provider) throw new Error(`No provider for source type: ${type}`)
  return provider
}
