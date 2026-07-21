/**
 * @amarktai/artifacts — Local accumulation asset storage layer.
 */

export {
  ArtifactStorageDriver,
  getArtifactStorage,
  type StoragePutResult,
  type StorageFileInfo,
} from './storage.js'

export {
  saveArtifact,
  getArtifactPublicUrl,
  getArtifactRecord,
  getArtifactFile,
  getArtifactStream,
  findCompletedArtifactByTraceId,
  type SaveArtifactOptions,
  type SavedArtifact,
} from './manager.js'
export { createProviderMediaUrl, verifyProviderMediaToken } from './provider-media-token.js'
