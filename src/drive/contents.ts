// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ServiceManager, ContentsManager, Contents,
  IAjaxSettings, utils
} from '@jupyterlab/services';

import {
  clearSignalData, defineSignal, ISignal
} from 'phosphor/lib/core/signaling';

import {
  IServiceManager
} from 'jupyterlab/lib/services';

import {
  IDocumentRegistry
} from 'jupyterlab/lib/docregistry';

import {
  authorize
} from '../gapi';

import * as drive from './drive';

const NOTEBOOK_MIMETYPE = 'application/ipynb';

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
  constructor(registry: IDocumentRegistry) {
    super();
    this._driveContents = new GoogleDriveContentsManager({}, registry);
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
  constructor(options: ContentsManager.IOptions = {}, registry: IDocumentRegistry) {
    this._docRegistry = registry;
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
   * Get a file or directory.
   *
   * @param path: The path to the file.
   *
   * @param options: The options used to fetch the file.
   *
   * @returns A promise which resolves with the file content.
   */
  get(path: string, options?: Contents.IFetchOptions): Promise<Contents.IModel> {
    let getContent = options ? !!options.content : true;
    if(!this._authorized) {
      this._authorize();
    }
    return this._authorized.then(()=>{
      return drive.contentsModelForPath(path, getContent)
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
  getDownloadUrl(path: string): Promise<string> {
    return drive.urlForFile(path);
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
    //Set default values
    let ext = '';
    let baseName = 'Untitled'
    let path = '';
    let contentType: Contents.ContentType = 'notebook';

    if(options) {
      //Add leading `.` to extension if necessary.
      ext = options.ext ?
            ContentsManager.normalizeExtension(options.ext) : ext;
      //If we are not creating in the root directory
      path = options.path || '';
      contentType = options.type || 'notebook';
    }

    let model: any = null;
    if (contentType === 'notebook') {
      ext = '.ipynb';
      baseName = 'Untitled'
      model = {
        type: 'notebook',
        content: this._docRegistry.getModelFactory('Notebook')
                 .createNew().toJSON(),
        mimetype: NOTEBOOK_MIMETYPE,
        format: 'json'
      };
    } else if (contentType === 'file') {
      ext = ext || '.txt';
      baseName = 'untitled';
      model = {
        type: 'file',
        content: '',
        mimetype: 'text/plain',
        format: 'text'
      };
    } else if (contentType === 'directory') {
      ext = '';
      baseName = 'Untitled Folder';
      model = {
        type: 'directory',
        content: [],
        format : 'json'
      }
    } else {
      throw new Error("Unrecognized type " + contentType);
    }

    return this._getNewFilename(path, ext, baseName).then((name: string)=>{
      model['name'] = name;
      path = utils.urlPathJoin(path, name);
      return drive.uploadFile(path, model as Contents.IModel, false);
    }).then((contents: Contents.IModel)=>{
      this.fileChanged.emit({
        type: 'new',
        oldValue: null,
        newValue: contents
      });
      return contents;
    });
  }

  /**
   * Delete a file.
   *
   * @param path - The path to the file.
   *
   * @returns A promise which resolves when the file is deleted.
   */
  delete(path: string): Promise<void> {
    return drive.deleteFile(path).then(()=>{
      this.fileChanged.emit({
        type: 'delete',
        oldValue: { path },
        newValue: null
      });
      return void 0;
    });
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
    if(path === newPath) {
      return this.get(path);
    } else {
      return drive.moveFile(path, newPath).then((contents: Contents.IModel)=>{
        this.fileChanged.emit({
          type: 'rename',
          oldValue: { path },
          newValue: contents
        });
        return contents;
      });
    }
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
    return this.get(path).then((contents)=>{
      //The file exists
      if(options) {
        //Overwrite the existing file
        return drive.uploadFile(path, options, true);
      } else {
        //File exists, but we are not saving anything
        //to it? TODO: figure out the appropriate
        //way to handle this case.
        return void 0;
      }
    }, ()=>{
      //The file does not exist already, create a new one.
      return drive.uploadFile(path, options, false)
    }).then((contents)=>{
      this.fileChanged.emit({
        type: 'save',
        oldValue: null,
        newValue: contents
      });
      return contents;
    });
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
    return drive.pinCurrentRevision(path);
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
    return drive.listRevisions(path);
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
    //TODO: should this emit a signal?
    return drive.revertToRevision(path, checkpointID);
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
    return drive.unpinRevision(path, checkpointID);
  }

  private _authorize(): void {
    this._authorized = authorize();
  }

  /**
   * Obtains the filename that should be used for a new file in a given
   * folder.  This is the next file in the series Untitled0, Untitled1, ... in
   * the given drive folder.  As a fallback, returns Untitled.
   *
   * @param path - The path of the directory in which we are making the file.
   * @param ext - The file extension.
   * @param baseName - The base name of the new file
   * @return A promise fullfilled with the new filename.
   */
  private _getNewFilename(path: string, ext: string, baseName: string): Promise<string> {
    //Get the file listing for the directory
    //let query = '\''+baseName+'\' in name and \''+ext+'\' in name';
    let query = 'name contains \''+baseName+
                '\' and name contains \''+ext+'\'';
    return drive.searchDirectory(path, query).then((resourceList: any[])=>{
      let existingNames: any= {};
      for( let i = 0; i < resourceList.length; i++) {
        existingNames[resourceList[i].name] = true;
      }

      //Loop over the list and select the first name that
      //does not exist. Note that the loop is N+1 iterations,
      //so is guaranteed to come up with a name that is not
      //in `existingNames`.
      for (let i = 0; i <= resourceList.length; i++) {
        let filename = baseName + (i > 0 ? String(i) : '') + ext;
        if (!existingNames[filename]) {
          return filename;
        }
      }
    });
  }

  private _baseUrl = 'https://www.googleapis.com/drive/v3';
  private _isDisposed = false;
  private _authorized: Promise<void> = null;
  private _docRegistry: IDocumentRegistry = null;
}

// Define the signals for the `GoogleDriveContentsManager` class.
defineSignal(GoogleDriveContentsManager.prototype, 'fileChanged');
