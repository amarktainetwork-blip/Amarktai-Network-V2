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
  getArtifactFile,
  type SaveArtifactOptions,
  type SavedArtifact,
} from './manager.js'
