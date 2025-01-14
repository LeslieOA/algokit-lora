import { TransactionResult, TransactionSearchResults } from '@algorandfoundation/algokit-utils/types/indexer'
import { flattenTransactionResult } from '@/features/transactions/utils/flatten-transaction-result'
import { TransactionType } from 'algosdk'
import { Arc3MetadataResult, Arc69MetadataResult, AssetMetadataResult, AssetMetadataStandard, AssetResult } from './types'
import { getArc19Url, isArc19Url } from '../utils/arc19'
import { getArc3Url, isArc3Url } from '../utils/arc3'
import { base64ToUtf8 } from '@/utils/base64-to-utf8'
import { ZERO_ADDRESS } from '@/features/common/constants'
import { executePaginatedRequest } from '@algorandfoundation/algokit-utils'
import { atomsInAtom } from '@/features/common/data'
import { indexer } from '@/features/common/data/algo-client'
import { replaceIpfsWithGatewayIfNeeded } from '../utils/replace-ipfs-with-gateway-if-needed'

// Currently, we support ARC-3, 19 and 69. Their specs can be found here https://github.com/algorandfoundation/ARCs/tree/main/ARCs
// ARCs are community standard, therefore, there are edge cases
// For example:
// - An asset can follow ARC-69 and ARC-19 at the same time: https://allo.info/asset/1559471783/nft
// - An asset can follow ARC-3 and ARC-19 at the same time: https://allo.info/asset/1494117806/nft
// - ARC-19 doesn't specify the metadata format but generally people use the ARC-3 format
const createAssetMetadataResult = async (
  assetResult: AssetResult,
  latestAssetCreateOrReconfigureTransaction?: TransactionResult
): Promise<AssetMetadataResult> => {
  // Get ARC-69 metadata if applicable
  if (latestAssetCreateOrReconfigureTransaction && latestAssetCreateOrReconfigureTransaction.note) {
    const metadata = noteToArc69Metadata(latestAssetCreateOrReconfigureTransaction.note)
    if (metadata) {
      return {
        standard: AssetMetadataStandard.ARC69,
        metadata,
      } satisfies Arc69MetadataResult
    }
  }

  // Get ARC-3 or ARC-19 metadata if applicable
  const [isArc3, isArc19] = assetResult.params.url
    ? ([isArc3Url(assetResult.params.url), isArc19Url(assetResult.params.url)] as const)
    : [false, false]

  if (assetResult.params.url && (isArc3 || isArc19)) {
    // If the asset follows both ARC-3 and ARC-19, we build the ARC-19 url
    const metadataUrl = isArc19
      ? getArc19Url(assetResult.params.url, assetResult.params.reserve)
      : getArc3Url(assetResult.index, assetResult.params.url)

    if (metadataUrl) {
      const gatewayMetadataUrl = replaceIpfsWithGatewayIfNeeded(metadataUrl)
      const response = await fetch(gatewayMetadataUrl)
      try {
        const { localization: _localization, ...metadata } = await response.json()
        return {
          standard: AssetMetadataStandard.ARC3,
          metadata_url: gatewayMetadataUrl,
          metadata,
        } satisfies Arc3MetadataResult
      } catch (error) {
        if (error instanceof SyntaxError) {
          const headResponse = await fetch(gatewayMetadataUrl, { method: 'HEAD' })
          const contentType = headResponse.headers.get('Content-Type')
          if (contentType && contentType.startsWith('image/')) {
            return {
              standard: AssetMetadataStandard.ARC3,
              metadata: {
                image: metadataUrl,
              },
            } satisfies Arc3MetadataResult
          } else if (contentType && contentType.startsWith('video/')) {
            return {
              standard: AssetMetadataStandard.ARC3,
              metadata: {
                animation_url: metadataUrl,
              },
            } satisfies Arc3MetadataResult
          }
          // eslint-disable-next-line no-console
          console.error('Failed to build asset metadata', error)
        } else {
          throw error
        }
      }
    }
  }

  return null
}

const noteToArc69Metadata = (note: string | undefined) => {
  if (!note) {
    return undefined
  }

  const json = base64ToUtf8(note)
  if (json.match(/^{/) && json.includes('arc69')) {
    return JSON.parse(json) as Arc69MetadataResult['metadata']
  }
  return undefined
}

const getAssetMetadataResult = async (assetResult: AssetResult) => {
  if (assetResult.index === 0) {
    return null
  }

  let results =
    assetResult.params.manager && assetResult.params.manager !== ZERO_ADDRESS
      ? await indexer
          .searchForTransactions()
          .assetID(assetResult.index)
          .txType('acfg')
          .address(assetResult.params.manager)
          .addressRole('sender')
          .limit(2) // Return 2 to cater for a destroy transaction and any potential eventual consistency delays between transactions and assets.
          .do()
          .then((res) => res.transactions as TransactionResult[]) // Implicitly newest to oldest when filtering with an address.
      : []
  if (results.length === 0) {
    // The asset has been destroyed, is an immutable asset, or the asset is mutable however has never been mutated.
    // Fetch the entire acfg transaction history and reverse the order, so it's newest to oldest.
    results = await executePaginatedRequest(
      (res: TransactionSearchResults) => res.transactions,
      (nextToken) => {
        let s = indexer.searchForTransactions().assetID(assetResult.index).txType('acfg')
        if (nextToken) {
          s = s.nextToken(nextToken)
        }
        return s
      }
    ).then((res) => res.reverse()) // reverse the order, so it's newest to oldest
  }

  const assetConfigTransactionResults = results.flatMap(flattenTransactionResult).filter((t) => {
    const isAssetConfigTransaction = t['tx-type'] === TransactionType.acfg
    const isDestroyTransaction = t['asset-config-transaction']?.['params'] === undefined
    return isAssetConfigTransaction && !isDestroyTransaction
  })

  if (assetConfigTransactionResults.length === 0) {
    return null
  }

  return await createAssetMetadataResult(assetResult, assetConfigTransactionResults[0])
}

export const [assetMetadataResultsAtom, getAssetMetadataResultAtom] = atomsInAtom(
  getAssetMetadataResult,
  (assetResult) => assetResult.index
)
