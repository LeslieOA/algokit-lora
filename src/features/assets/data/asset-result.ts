import { atom } from 'jotai'
import { AssetId, AssetResult } from './types'
import { indexer, algod } from '@/features/common/data'
import { asError, is404 } from '@/utils/error'
import { atomsInAtom } from '@/features/common/data/atoms-in-atom'
import { ZERO_ADDRESS } from '@/features/common/constants'

export const algoAssetResult = {
  index: 0,
  'created-at-round': 0,
  params: {
    creator: ZERO_ADDRESS,
    decimals: 6,
    total: 10_000_000_000_000_000n,
    name: 'ALGO',
    'unit-name': 'ALGO',
    url: 'https://www.algorand.foundation',
  },
} as AssetResult

const createAssetResultAtom = (assetId: AssetId) =>
  atom<Promise<AssetResult> | AssetResult>(async (_get) => {
    try {
      // Check algod first, as there can be some syncing delays to indexer
      return await algod
        .getAssetByID(assetId)
        .do()
        .then((result) => result as AssetResult)
    } catch (e: unknown) {
      if (is404(asError(e))) {
        // Handle destroyed assets or assets that may not be available in algod potentially due to the node type
        return await indexer
          .lookupAssetByID(assetId)
          .includeAll(true) // Returns destroyed assets
          .do()
          .then((result) => result.asset as AssetResult)
      }
      throw e
    }
  })

export const [assetResultsAtom, getAssetResultAtom] = atomsInAtom(
  createAssetResultAtom,
  (assetId) => assetId,
  new Map([[algoAssetResult.index, atom(algoAssetResult)]])
)