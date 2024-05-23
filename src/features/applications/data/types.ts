import { ApplicationResult as IndexerApplicationResult } from '@algorandfoundation/algokit-utils/types/indexer'

export type ApplicationId = number

export type ApplicationMetadataResult = {
  name: string
} | null

export type ApplicationResult = Omit<IndexerApplicationResult, 'created-at-round' | 'deleted-at-round'>
