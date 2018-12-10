// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Signal, ISignal } from '@phosphor/signaling';

import { PathExt } from '@jupyterlab/coreutils';

import { DocumentRegistry } from '@jupyterlab/docregistry';

import { Contents, ServerConnection } from '@jupyterlab/services';

import * as drive from './drive';

import { makeError } from './gapi';

/**
 * A contents manager that passes file operations to the server.
 *
 * This includes checkpointing with the normal file operations.
 */
export class GoogleDrive implements Contents.IDrive {
  /**
   * Construct a new contents manager object.
   *
   * @param options - The options used to initialize the object.
   */
  constructor(registry: DocumentRegistry) {
    this._docRegistry = registry;
    // Construct a function to make a best-guess IFileType
    // for a given path.
    this._fileTypeForPath = (path: string) => {
      const fileTypes = registry.getFileTypesForPath(path);
      return fileTypes.length === 0
        ? registry.getFileType('text')!
        : fileTypes[0];
    };
    // Construct a function to return a best-guess IFileType
    // for a given contents model.
    this._fileTypeForContentsModel = (model: Partial<Contents.IModel>) => {
      return registry.getFileTypeForModel(model);
    };
  }

  /**
   * The name of the drive.
   */
  get name(): 'GDrive' {
    return 'GDrive';
  }

  /**
   * Server settings (unused for interfacing with Google Drive).
   */
  readonly serverSettings: ServerConnection.ISettings;

  /**
   * A signal emitted when a file operation takes place.
   */
  get fileChanged(): ISignal<this, Contents.IChangedArgs> {
    return this._fileChanged;
  }

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
    Signal.clearData(this);
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
  get(
    path: string,
    options?: Contents.IFetchOptions
  ): Promise<Contents.IModel> {
    const getContent = options ? !!options.content : true;
    // TODO: the contents manager probably should not be passing in '.'.
    path = path === '.' ? '' : path;
    return drive
      .contentsModelForPath(path, getContent, this._fileTypeForPath)
      .then(contents => {
        try {
          Contents.validateContentsModel(contents);
        } catch (error) {
          throw makeError(200, error.message);
        }
        return contents;
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
    // Set default values.
    let ext = '';
    let baseName = 'Untitled';
    let path = '';
    let contentType: Contents.ContentType = 'notebook';
    let fileType: DocumentRegistry.IFileType;

    if (options) {
      // Add leading `.` to extension if necessary.
      ext = options.ext ? PathExt.normalizeExtension(options.ext) : ext;
      // If we are not creating in the root directory.
      path = options.path || '';
      contentType = options.type || 'notebook';
    }

    let model: Partial<Contents.IModel>;
    if (contentType === 'notebook') {
      fileType = DocumentRegistry.defaultNotebookFileType;
      ext = ext || fileType.extensions[0];
      baseName = 'Untitled';
      const modelFactory = this._docRegistry.getModelFactory('Notebook');
      if (!modelFactory) {
        throw Error('No model factory is registered with the DocRegistry');
      }
      model = {
        type: fileType.contentType,
        content: modelFactory.createNew().toJSON(),
        mimetype: fileType.mimeTypes[0],
        format: fileType.fileFormat
      };
    } else if (contentType === 'file') {
      fileType = DocumentRegistry.defaultTextFileType;
      ext = ext || fileType.extensions[0];
      baseName = 'untitled';
      model = {
        type: fileType.contentType,
        content: '',
        mimetype: fileType.mimeTypes[0],
        format: fileType.fileFormat
      };
    } else if (contentType === 'directory') {
      fileType = DocumentRegistry.defaultDirectoryFileType;
      ext = ext || '';
      baseName = 'Untitled Folder';
      model = {
        type: fileType.contentType,
        content: [],
        format: fileType.fileFormat
      };
    } else {
      throw new Error('Unrecognized type ' + contentType);
    }

    return this._getNewFilename(path, ext, baseName)
      .then((name: string) => {
        const m = { ...model, name };
        path = PathExt.join(path, name);
        return drive.uploadFile(
          path,
          m,
          fileType,
          false,
          this._fileTypeForPath
        );
      })
      .then((contents: Contents.IModel) => {
        try {
          Contents.validateContentsModel(contents);
        } catch (error) {
          throw makeError(201, error.message);
        }
        this._fileChanged.emit({
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
    return drive.deleteFile(path).then(() => {
      this._fileChanged.emit({
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
    if (path === newPath) {
      return this.get(path);
    } else {
      return drive
        .moveFile(path, newPath, this._fileTypeForPath)
        .then((contents: Contents.IModel) => {
          try {
            Contents.validateContentsModel(contents);
          } catch (error) {
            throw makeError(200, error.message);
          }
          this._fileChanged.emit({
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
  save(
    path: string,
    options: Partial<Contents.IModel>
  ): Promise<Contents.IModel> {
    const fileType = this._fileTypeForContentsModel(options);
    return this.get(path)
      .then(
        contents => {
          // The file exists.
          if (options) {
            // Overwrite the existing file.
            return drive.uploadFile(
              path,
              options,
              fileType,
              true,
              this._fileTypeForPath
            );
          } else {
            // File exists, but we are not saving anything
            // to it? Just return the contents.
            return contents;
          }
        },
        () => {
          // The file does not exist already, create a new one.
          return drive.uploadFile(
            path,
            options,
            fileType,
            false,
            this._fileTypeForPath
          );
        }
      )
      .then((contents: Contents.IModel) => {
        try {
          Contents.validateContentsModel(contents);
        } catch (error) {
          throw makeError(200, error.message);
        }
        this._fileChanged.emit({
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
    let fileBasename = PathExt.basename(fromFile).split('.')[0];
    fileBasename += '-Copy';
    const ext = PathExt.extname(fromFile);

    return this._getNewFilename(toDir, ext, fileBasename).then(name => {
      return drive
        .copyFile(fromFile, PathExt.join(toDir, name), this._fileTypeForPath)
        .then(contents => {
          try {
            Contents.validateContentsModel(contents);
          } catch (error) {
            throw makeError(201, error.message);
          }
          this._fileChanged.emit({
            type: 'new',
            oldValue: null,
            newValue: contents
          });
          return contents;
        });
    });
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
    return drive.pinCurrentRevision(path).then(checkpoint => {
      try {
        Contents.validateCheckpointModel(checkpoint);
      } catch (error) {
        throw makeError(200, error.message);
      }
      return checkpoint;
    });
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
    return drive.listRevisions(path).then(checkpoints => {
      try {
        for (let checkpoint of checkpoints) {
          Contents.validateCheckpointModel(checkpoint);
        }
      } catch (error) {
        throw makeError(200, error.message);
      }
      return checkpoints;
    });
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
    // TODO: should this emit a signal?
    const fileType = this._fileTypeForPath(path);
    return drive.revertToRevision(path, checkpointID, fileType);
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
  private _getNewFilename(
    path: string,
    ext: string,
    baseName: string
  ): Promise<string> {
    // Check that the target directory is a valid
    // directory (i.e., not the pseudo-root or
    // the "Shared with me" directory).
    if (drive.isDummy(path)) {
      throw makeError(
        400,
        `Google Drive: "${path}"` + ' is not a valid save directory'
      );
    }
    // Get the file listing for the directory.
    const query =
      "name contains '" + baseName + "' and name contains '" + ext + "'";
    return drive.searchDirectory(path, query).then(resourceList => {
      const existingNames: any = {};
      for (let i = 0; i < resourceList.length; i++) {
        existingNames[resourceList[i].name!] = true;
      }

      // Loop over the list and select the first name that
      // does not exist. Note that the loop is N+1 iterations,
      // so is guaranteed to come up with a name that is not
      // in `existingNames`.
      for (let i = 0; i <= resourceList.length; i++) {
        const filename = baseName + (i > 0 ? String(i) : '') + ext;
        if (!existingNames[filename]) {
          return filename;
        }
      }
      // Should not get here.
      throw Error('Could not find a valid filename');
    });
  }

  private _baseUrl = 'https://www.googleapis.com/drive/v3';
  private _isDisposed = false;
  private _docRegistry: DocumentRegistry;
  private _fileTypeForPath: (path: string) => DocumentRegistry.IFileType;
  private _fileTypeForContentsModel: (
    model: Partial<Contents.IModel>
  ) => DocumentRegistry.IFileType;
  private _fileChanged = new Signal<this, Contents.IChangedArgs>(this);
}
