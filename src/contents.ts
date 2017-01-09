// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ServiceManager, ContentsManager, Contents,
  IAjaxSettings
} from '@jupyterlab/services';

import {
  clearSignalData, defineSignal, ISignal
} from 'phosphor/lib/core/signaling';

import {
  IServiceManager
} from 'jupyterlab/lib/services';

import {
  authorize
} from './gapi';

import {
  getResourceForPath, contentsModelFromFileResource,
  FOLDER_MIMETYPE, FILE_MIMETYPE
} from './drive';


/**
 * An implementation of an IServiceManager

 * which swaps out the local ContentsManager
 * with one that talks to Google Drive.
 */
export
class GoogleDriveServiceManager extends ServiceManager {
  /**
   * Construct the services provider.
   */
  constructor() {
    super();
    this._driveContents = new GoogleDriveContentsManager();
  }

  /**
   * Get the drive contents manager.
   */
  get contents(): ContentsManager {
    return <ContentsManager><any>this._driveContents;
  }

  private _driveContents: GoogleDriveContentsManager = null;
}

/**
 * A contents manager that passes file operations to the server.
 *
 * This includes checkpointing with the normal file operations.
 */
export
class GoogleDriveContentsManager implements Contents.IManager {
  /**
   * Construct a new contents manager object.
   *
   * @param options - The options used to initialize the object.
   */
  constructor(options: ContentsManager.IOptions = {}) {
  }

  /**
   * A signal emitted when a file operation takes place.
   */
  fileChanged: ISignal<this, Contents.IChangedArgs>;

  /**
   * Test whether the manager has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**h
   * Dispose of the resources held by the manager.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._isDisposed = true;
    clearSignalData(this);
  }

  /**
   * Get the base url of the manager.
   */
  get baseUrl(): string {
    return this._baseUrl;
  }

  /**
   * Get a copy of the default ajax settings for the contents manager.
   */
  get ajaxSettings(): IAjaxSettings {
    return {} as IAjaxSettings;
  }
  /**
   * Set the default ajax settings for the contents manager.
   */
  set ajaxSettings(value: IAjaxSettings) {
  }

  /**
   * Get a file or directory.
   *
   * @param path: The path to the file.
   *
   * @param options: The options used to fetch the file.
   *
   * @returns A promise which resolves with the file content.
   */
  get(path: string, options?: Contents.IFetchOptions): Promise<Contents.IModel> {
    if( !this._authorized ) {
      this._authorize();
    }
    return new Promise<Contents.IModel>((resolve,reject)=>{
      this._authorized.then(()=>{
        getResourceForPath(path).then((resource: any)=>{
          resolve(contentsModelFromFileResource(resource, path, true));
        });
      });
    });
  }

  /**
   * Get an encoded download url given a file path.
   *
   * @param path - An absolute POSIX file path on the server.
   *
   * #### Notes
   * It is expected that the path contains no relative paths,
   * use [[ContentsManager.getAbsolutePath]] to get an absolute
   * path if necessary.
   */
  getDownloadUrl(path: string): string {
    return '';
  }

  /**
   * Create a new untitled file or directory in the specified directory path.
   *
   * @param options: The options used to create the file.
   *
   * @returns A promise which resolves with the created file content when the
   *    file is created.
   */
  newUntitled(options: Contents.ICreateOptions = {}): Promise<Contents.IModel> {
    return Promise.reject(void 0);
  }

  /**
   * Delete a file.
   *
   * @param path - The path to the file.
   *
   * @returns A promise which resolves when the file is deleted.
   */
  delete(path: string): Promise<void> {
    return Promise.reject(void 0);
  }

  /**
   * Rename a file or directory.
   *
   * @param path - The original file path.
   *
   * @param newPath - The new file path.
   *
   * @returns A promise which resolves with the new file contents model when
   *   the file is renamed.
   */
  rename(path: string, newPath: string): Promise<Contents.IModel> {
    return Promise.reject(void 0);
  }

  /**
   * Save a file.
   *
   * @param path - The desired file path.
   *
   * @param options - Optional overrides to the model.
   *
   * @returns A promise which resolves with the file content model when the
   *   file is saved.
   */
  save(path: string, options: Contents.IModel = {}): Promise<Contents.IModel> {
    return Promise.reject(void 0);
  }

  /**
   * Copy a file into a given directory.
   *
   * @param path - The original file path.
   *
   * @param toDir - The destination directory path.
   *
   * @returns A promise which resolves with the new contents model when the
   *  file is copied.
   */
  copy(fromFile: string, toDir: string): Promise<Contents.IModel> {
    return Promise.reject(void 0);
  }

  /**
   * Create a checkpoint for a file.
   *
   * @param path - The path of the file.
   *
   * @returns A promise which resolves with the new checkpoint model when the
   *   checkpoint is created.
   */
  createCheckpoint(path: string): Promise<Contents.ICheckpointModel> {
    return Promise.reject(void 0);
  }

  /**
   * List available checkpoints for a file.
   *
   * @param path - The path of the file.
   *
   * @returns A promise which resolves with a list of checkpoint models for
   *    the file.
   */
  listCheckpoints(path: string): Promise<Contents.ICheckpointModel[]> {
    return Promise.reject(void 0);
  }

  /**
   * Restore a file to a known checkpoint state.
   *
   * @param path - The path of the file.
   *
   * @param checkpointID - The id of the checkpoint to restore.
   *
   * @returns A promise which resolves when the checkpoint is restored.
   */
  restoreCheckpoint(path: string, checkpointID: string): Promise<void> {
    return Promise.reject(void 0);
  }

  /**
   * Delete a checkpoint for a file.
   *
   * @param path - The path of the file.
   *
   * @param checkpointID - The id of the checkpoint to delete.
   *
   * @returns A promise which resolves when the checkpoint is deleted.
   */
  deleteCheckpoint(path: string, checkpointID: string): Promise<void> {
    return Promise.reject(void 0);
  }

  private _authorize(): void {
    this._authorized = authorize();
  }

  private _baseUrl = '';
  private _isDisposed = false;
  private _ajaxSettings: IAjaxSettings = null;
  private _authorized: Promise<void> = null;
}

// Define the signals for the `GoogleDriveContentsManager` class.
defineSignal(GoogleDriveContentsManager.prototype, 'fileChanged');
