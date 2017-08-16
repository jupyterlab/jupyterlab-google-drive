// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

/// <reference path="./gapi.client.drive.d.ts" />

import {
  map, filter, toArray
} from '@phosphor/algorithm';

import {
  Contents
} from '@jupyterlab/services';

import {
  PathExt
} from '@jupyterlab/coreutils';

import {
  DocumentRegistry
} from '@jupyterlab/docregistry';

import {
  driveApiRequest, gapiAuthorized, gapiInitialized
} from '../gapi';


const RESOURCE_FIELDS='kind,id,name,mimeType,trashed,headRevisionId,'+
                      'parents,modifiedTime,createdTime,capabilities,'+
                      'webContentLink';

export
const RT_MIMETYPE = 'application/vnd.google-apps.drive-sdk';
export
const FOLDER_MIMETYPE = 'application/vnd.google-apps.folder';
export
const FILE_MIMETYPE = 'application/vnd.google-apps.file';

const MULTIPART_BOUNDARY = '-------314159265358979323846';

/**
 * Type alias for a files resource returned by
 * the Google Drive API.
 */
export
type FileResource = gapi.client.drive.File;

/**
 * Type alias for a Google Drive revision resource.
 */
export
type RevisionResource = gapi.client.drive.Revision;


/**
 * Alias for directory IFileType.
 */
const directoryFileType = DocumentRegistry.defaultDirectoryFileType;

/**
 * The name of the dummy "Shared with me" folder.
 */
const SHARED_DIRECTORY = 'Shared with me';

/**
 * The name of the root "My Drive" folder.
 */
const DRIVE_DIRECTORY = 'My Drive';

/**
 * The path of the dummy pseudo-root folder.
 */
const COLLECTIONS_DIRECTORY = '';

/**
 * A dummy files resource for the "Shared with me" folder.
 */
const SHARED_DIRECTORY_RESOURCE: FileResource = {
  kind: 'dummy',
  name: SHARED_DIRECTORY,
}

/**
 * A dummy files resource for the pseudo-root folder.
 */
const COLLECTIONS_DIRECTORY_RESOURCE: FileResource = {
  kind: 'dummy',
  name: '',
}


/* ****** Functions for uploading/downloading files ******** */

/**
 * Get a download URL for a file path.
 *
 * @param path - the path corresponding to the file.
 *
 * @returns a promise that resolves with the download URL.
 */
export
function urlForFile(path: string): Promise<string> {
  return getResourceForPath(path).then((resource: FileResource) => {
    return resource.webContentLink;
  });
}

/**
 * Given a path and `Contents.IModel`, upload the contents to Google Drive.
 *
 * @param path - the path to which to upload the contents.
 *
 * @param model - the `Contents.IModel` to upload.
 *
 * @param fileType - a candidate DocumentRegistry.IFileType for the given file.
 *
 * @param exisiting - whether the file exists.
 *
 * @returns a promise fulfulled with the `Contents.IModel` that has been uploaded,
 *   or throws an Error if it fails.
 */
export
function uploadFile(path: string, model: Partial<Contents.IModel>, fileType: DocumentRegistry.IFileType, existing: boolean = false): Promise<Contents.IModel> {
  if (isDummy(PathExt.dirname(path)) && !existing) {
    return Promise.reject(
      `Google Drive: "${path}" is not a valid target directory`);
  }
  let resourceReadyPromise = Promise.resolve(void 0);
  if(existing) {
    resourceReadyPromise = getResourceForPath(path)
  } else {
    resourceReadyPromise = new Promise<FileResource>((resolve, reject) => {
      let enclosingFolderPath = PathExt.dirname(path);
      enclosingFolderPath =
        enclosingFolderPath === '.' ? '' : enclosingFolderPath;
      let resource: FileResource = fileResourceFromContentsModel(model, fileType);
      getResourceForPath(enclosingFolderPath)
      .then((parentFolderResource: FileResource) => {
        if(parentFolderResource.mimeType !== FOLDER_MIMETYPE) {
           throw new Error("Google Drive: expected a folder: "+path);
        }
        resource.parents = [parentFolderResource.id];
        resolve(resource);
      });
    });
  }
  return resourceReadyPromise.then((resource: FileResource) => {
    // Construct the HTTP request: first the metadata,
    // then the content of the uploaded file.

    let delimiter = '\r\n--' + MULTIPART_BOUNDARY + '\r\n';
    let closeDelim = '\r\n--' + MULTIPART_BOUNDARY + '--';

    // Metatdata part.
    let body = delimiter+'Content-Type: application/json\r\n\r\n';
    // Don't update metadata if the file already exists.
    if(!existing) {
      body += JSON.stringify(resource);
    }
    body += delimiter;

    // Content of the file.
    body += 'Content-Type: ' + resource.mimeType + '\r\n';
    // It is not well documented, but as can be seen in
    // filebrowser/src/model.ts, anything that is not a
    // notebook is a base64 encoded string.
    if (model.format === 'base64') {
      // Google drive has some trouble parsing base64 encoded things
      // in such a way that they will continue being useful. Just
      // decode them client-side for now.
      body +='\r\n' + atob(model.content) + closeDelim;
    } else if (model.format === 'text') {
      // If it is already a text string, just send that.
      body +='\r\n' + model.content + closeDelim;
    } else {
      // Notebook case.
      body +='\r\n' + JSON.stringify(model.content) + closeDelim;
    }

    let apiPath = '/upload/drive/v3/files';
    let method = 'POST';

    if(existing) {
      method = 'PATCH';
      apiPath = apiPath+'/'+resource.id;
    }

    let request = gapi.client.request({
      path: apiPath,
      method: method,
      params: {
        uploadType: 'multipart',
        fields: RESOURCE_FIELDS
        },
      headers: {
        'Content-Type': 'multipart/related; boundary="' +
          MULTIPART_BOUNDARY + '"'
        },
      body: body
    });

    return driveApiRequest<FileResource>(request);
  }).then((result) => {
    console.log("gapi: uploaded document to "+result.id);
    // Update the cache.
    Private.resourceCache.set(path, result);

    return contentsModelFromFileResource(result, path, fileType, true, undefined);
  });
}

/**
 * Given a files resource, construct a Contents.IModel.
 *
 * @param resource - the files resource.
 *
 * @param path - the path at which the resource exists in the filesystem.
 *   This should include the name of the file itself.
 *
 * @param fileType - a candidate DocumentRegistry.IFileType for the given file.
 *
 * @param includeContents - whether to download the actual text/json/binary
 *   content from the server. This takes much more bandwidth, so should only
 *   be used when required.
 *
 * @param fileTypeForPath - A function that, given a path argument, returns
 *   and DocumentRegistry.IFileType that is consistent with the path.
 *
 * @returns a promise fulfilled with the Contents.IModel for the resource.
 */
export
function contentsModelFromFileResource(resource: FileResource, path: string, fileType: DocumentRegistry.IFileType, includeContents: boolean, fileTypeForPath: (path: string) => DocumentRegistry.IFileType | undefined = undefined): Promise<Contents.IModel> {
  // Handle the exception of the dummy directories
  if (resource.kind === 'dummy') {
    return contentsModelFromDummyFileResource(resource, path, includeContents, fileTypeForPath);
  }
  // Handle the case of getting the contents of a directory.
  if(resource.mimeType === FOLDER_MIMETYPE) {
    // Enter contents metadata.
    let contents: Contents.IModel = {
      name: resource.name,
      path: path,
      type: 'directory',
      writable: resource.capabilities.canEdit,
      created: String(resource.createdTime),
      last_modified: String(resource.modifiedTime),
      mimetype: fileType.mimeTypes[0],
      content: null,
      format: 'json'
    };

    // Get directory listing if applicable.
    if (includeContents) {
      if (!fileTypeForPath) {
        throw Error('Must include fileTypeForPath argument to get directory listing');
      }
      let fileList: FileResource[] = [];
      return searchDirectory(path).then((resources: FileResource[]) => {
        //Update the cache.
        Private.clearCacheForDirectory(path);
        Private.populateCacheForDirectory(path, resources);

        let currentContents = Promise.resolve({});

        for(let i = 0; i<resources.length; i++) {
          let currentResource = resources[i];
          let resourcePath = path ?
                             path+'/'+currentResource.name :
                             currentResource.name;
          let resourceFileType = fileTypeForPath(resourcePath);
          currentContents = contentsModelFromFileResource(
            currentResource, resourcePath, resourceFileType, false);
          currentContents.then((contents: Contents.IModel) => {
            fileList.push(contents);
          });
        }
        return currentContents;
      }).then(() => {
        return {...contents, content: fileList};
      });
    } else {
      return Promise.resolve(contents);
    }
  } else {
    // Handle the case of getting the contents of a file.
    let contents: Contents.IModel = {
      name: resource.name,
      path: path,
      type: fileType.contentType,
      writable: resource.capabilities.canEdit,
      created: String(resource.createdTime),
      last_modified: String(resource.modifiedTime),
      mimetype: fileType.mimeTypes[0],
      content: null,
      format: fileType.fileFormat
    };
    // Download the contents from the server if necessary.
    if(includeContents) {
      return downloadResource(resource).then((result: any) => {
        let content: any = result;
        if (contents.format === 'base64') {
          content = btoa(result);
        } else if (resource.mimeType === 'application/json') {
          content = JSON.stringify(result, null, 2);
        }
        return { ...contents, content };
      });
    } else {
      return Promise.resolve(contents);
    }
  }
}

/**
 * There are two fake directories that we expose in the file browser
 * in order to have access to the "Shared with me" directory. This is
 * not a proper directory in the Google Drive system, just a collection
 * of files that have a `sharedWithMe` flag, so we have to treat it
 * separately. This constructs Contents.IModels from our dummy directories.
 *
 * @param resource: the dummy files resource.
 *
 * @param path: the path for the dummy resource.
 *
 * @param includeContents: whether to include the directory listing
 *   for the dummy directory.
 *
 * @param fileTypeForPath - A function that, given a path argument, returns
 *   and DocumentRegistry.IFileType that is consistent with the path.
 *
 * @returns a promise fulfilled with the a Contents.IModel for the resource.
 */
function contentsModelFromDummyFileResource(resource: FileResource, path: string, includeContents: boolean, fileTypeForPath: (path: string) => DocumentRegistry.IFileType): Promise<Contents.IModel> {
  // Construct the empty Contents.IModel.
  let contents: Contents.IModel = {
    name: resource.name,
    path: path,
    type: 'directory',
    writable: false,
    created: '',
    last_modified: '',
    content: null,
    mimetype: null,
    format: 'json'
  }
  if (includeContents && !fileTypeForPath) {
    throw Error('Must include fileTypeForPath argument to get directory listing');
  }
  if (resource.name === SHARED_DIRECTORY && includeContents) {
    // If `resource` is the SHARED_DIRECTORY_RESOURCE, and we
    // need the file listing for it, then get them.
    let fileList: Contents.IModel[] = [];
    return searchSharedFiles().then((resources: FileResource[]) => {
      //Update the cache.
      Private.clearCacheForDirectory(path);
      Private.populateCacheForDirectory(path, resources);

      let currentContents = Promise.resolve({});

      for(let i = 0; i<resources.length; i++) {
        let currentResource = resources[i];
        let resourcePath = path ?
                           path+'/'+currentResource.name :
                           currentResource.name;
        let resourceFileType = fileTypeForPath(resourcePath);
        currentContents = contentsModelFromFileResource(currentResource,
          resourcePath, resourceFileType, false, fileTypeForPath);
        currentContents.then((contents: Contents.IModel) => {
          fileList.push(contents);
        });
      }
      return currentContents;
    }).then(() => {
      let content = fileList;
      return { ...contents, content };
    });
  } else if (resource.name === '' && includeContents) {
    // If `resource` is the pseudo-root directory, construct
    // a contents model for it.
    let sharedContentsPromise = contentsModelFromFileResource(
      SHARED_DIRECTORY_RESOURCE, SHARED_DIRECTORY, directoryFileType,
      false, fileTypeForPath);
    let rootContentsPromise = resourceFromFileId('root').then(
      (rootResource) => {
        return contentsModelFromFileResource(rootResource,
                                             DRIVE_DIRECTORY,
                                             directoryFileType,
                                             false, fileTypeForPath);
      });
    return Promise.all([rootContentsPromise, sharedContentsPromise]).then(c => {
      return { ...contents, content: c };
    });
  } else {
    // Otherwise return the (mostly) empty contents model.
    return Promise.resolve(contents);
  }
}

/**
 * Given a path, get a `Contents.IModel` corresponding to that file.
 *
 * @param path - the path of the file.
 *
 * @param includeContents - whether to include the binary/text/contents of the file.
 *   If false, just get the metadata.
 *
 * @param fileTypeForPath - A function that, given a path argument, returns
 *   and DocumentRegistry.IFileType that is consistent with the path.
 *
 * @returns a promise fulfilled with the `Contents.IModel` of the appropriate file.
 *   Otherwise, throws an error.
 */
export
function contentsModelForPath(path: string, includeContents: boolean, fileTypeForPath: (path: string) => DocumentRegistry.IFileType): Promise<Contents.IModel> {
  let fileType = fileTypeForPath(path);
  return getResourceForPath(path).then((resource: FileResource) => {
    return contentsModelFromFileResource(resource, path, fileType, includeContents, fileTypeForPath)
  });
}


/* ********* Functions for file creation/deletion ************** */

/**
 * Give edit permissions to a Google drive user.
 *
 * @param resource: the FileResource to share.
 *
 * @param emailAddresses - the email addresses of the users for which
 *   to create the permissions.
 *
 * @returns a promise fulfilled when the permissions are created.
 */
export
function createPermissions (resource: FileResource, emailAddresses: string[] ): Promise<void> {
  // Do nothing for an empty list.
  if (emailAddresses.length === 0) {
    return Promise.resolve(void 0);
  }
  // Create a batch request for permissions.
  // Note: the typings for gapi.client are missing
  // the newBatch() function, which creates an HttpBatchRequest
  let batch: any = (gapi as any).client.newBatch();
  for (let address of emailAddresses) {
    let permissionRequest = {
      'type': 'user',
      'role': 'writer',
      'emailAddress': address
    }
    let request = gapi.client.drive.permissions.create({
      'fileId': resource.id,
      'emailMessage': `${resource.name} has been shared with you`,
      'sendNotificationEmail': true,
      'resource': permissionRequest
      });
    batch.add(request);
  }
  // Submit the batch request.
  return driveApiRequest<any>(batch).then(() => {
    return void 0;
  });
}

/**
 * Create a new document for realtime collaboration.
 * This file is not associated with a particular filetype,
 * and is not downloadable/readable.  Realtime documents
 * may also be associated with other, more readable documents.
 *
 * @returns a promise fulfilled with the fileId of the
 *   newly-created realtime document.
 */
export
function createRealtimeDocument(): Promise<string> {
  let request = gapi.client.drive.files.create({
      'resource': {
        mimeType: RT_MIMETYPE,
        name: 'jupyterlab_realtime_file'
        }
  });
  return driveApiRequest<FileResource>(request).then((result) => {
    console.log("gapi: created realtime document "+result.id);
    return result.id;
  });
}

/**
 * Load the realtime document associated with a file.
 *
 * @param fileId - the ID of the realtime file on Google Drive.
 *
 * @returns a promise fulfilled with the realtime document model.
 */
export
function loadRealtimeDocument(resource: FileResource, picked: boolean = false): Promise<gapi.drive.realtime.Document> {
  return new Promise((resolve, reject) => {
    gapiAuthorized.promise.then(() => {
      console.log("gapi: attempting to load realtime file " + resource.id);
      gapi.drive.realtime.load(resource.id, (doc: gapi.drive.realtime.Document ) => {
        resolve(doc);
      }, (model: gapi.drive.realtime.Model) => {
        /* no-op initializer */
      }, (err: any) => {
        // If there is a not found error, we may need to invoke
        // the picker to gain file access.
      });
    });
  });
}

/**
 * Delete a file from the users Google Drive.
 *
 * @param path - the path of the file to delete.
 *
 * @returns a promise fulfilled when the file has been deleted.
 */
export
function deleteFile(path: string): Promise<void> {
  return getResourceForPath(path).then((resource: FileResource) => {
    let request = gapi.client.drive.files.delete({ fileId: resource.id });
    return driveApiRequest<void>(request, 204);
  }).then(() => {
    //Update the cache
    Private.resourceCache.delete(path);

    return void 0;
  });
}

/* ****** Functions for file system querying/manipulation ***** */

/**
 * Search a directory.
 *
 * @param path - the path of the directory on the server.
 *
 * @param query - a query string, following the format of
 *   query strings for the Google Drive v3 API, which
 *   narrows down search results. An empty query string
 *   corresponds to just listing the contents of the directory.
 *
 * @returns a promise fulfilled with a list of files resources,
 *   corresponding to the files that are in the directory and
 *   match the query string.
 */
export
function searchDirectory(path: string, query: string = ''): Promise<FileResource[]> {
  return getResourceForPath(path).then((resource: FileResource) => {
    // Check to make sure this is a folder.
    if(resource.mimeType !== FOLDER_MIMETYPE) {
      throw new Error("Google Drive: expected a folder: "+path);
    }
    // Construct the query.
    let fullQuery: string = '\''+resource.id+'\' in parents '+
                            'and trashed = false';
    if(query) fullQuery += ' and '+query;

    let request = gapi.client.drive.files.list({
      q: fullQuery,
      fields: 'files('+RESOURCE_FIELDS+')'
    });
    return driveApiRequest(request);
  }).then((result: gapi.client.drive.FileList) => {
    return result.files;
  });
}

/**
 * Search the list of files that have been shared with the user.
 *
 * @param query - a query string, following the format of
 *   query strings for the Google Drive v3 API, which
 *   narrows down search results. An empty query string
 *   corresponds to just listing the shared files.
 *
 * @returns a promise fulfilled with the files that have been
 * shared with the user.
 */
export
function searchSharedFiles(query: string = ''): Promise<FileResource[]> {
  return gapiInitialized.promise.then(() => {
    // Construct the query.
    let fullQuery = 'sharedWithMe = true';
    if(query) fullQuery += ' and '+query;

    let request = gapi.client.drive.files.list({
      q: fullQuery,
      fields: 'files('+RESOURCE_FIELDS+')'
    });
    return driveApiRequest(request);
  }).then((result: gapi.client.drive.FileList) => {
    return result.files;
  });
}

/**
 * Move a file in Google Drive. Can also be used to rename the file.
 *
 * @param oldPath - The initial location of the file (where the path
 *   includes the filename).
 *
 * @param newPath - The new location of the file (where the path
 *   includes the filename).
 *
 * @param fileTypeForPath - A function that, given a path argument, returns
 *   and DocumentRegistry.IFileType that is consistent with the path.
 *
 * @returns a promise fulfilled with the `Contents.IModel` of the moved file.
 *   Otherwise, throws an error.
 */
export
function moveFile(oldPath: string, newPath: string, fileTypeForPath: (path: string) => DocumentRegistry.IFileType): Promise<Contents.IModel> {
  if (isDummy(PathExt.dirname(newPath))) {
    return Promise.reject(
      `GoogleDrive: "${newPath}" is not a valid target`);
  }
  if( oldPath === newPath ) {
    return contentsModelForPath(oldPath, false, fileTypeForPath);
  } else {
    let newFolderPath = PathExt.dirname(newPath);
    newFolderPath = newFolderPath === '.' ? '' : newFolderPath;

    // Get a promise that resolves with the resource in the current position.
    let resourcePromise = getResourceForPath(oldPath)
    // Get a promise that resolves with the resource of the new folder.
    let newFolderPromise = getResourceForPath(newFolderPath);

    // Check the new path to make sure there isn't already a file
    // with the same name there.
    let newName = PathExt.basename(newPath);
    let directorySearchPromise =
      searchDirectory(newFolderPath, 'name = \''+newName+'\'');

    // Once we have all the required information,
    // update the metadata with the new parent directory
    // for the file.
    return Promise.all([resourcePromise, newFolderPromise,
                       directorySearchPromise]).then((values) => {
      let resource = values[0];
      let newFolder = values[1];
      let directorySearch = values[2];

      if(directorySearch.length !== 0) {
        throw new Error("Google Drive: File with the same name "+
                        "already exists in the destination directory");
      } else {
        let request = gapi.client.drive.files.update({
          fileId: resource.id,
          addParents: newFolder.id,
          removeParents: resource.parents[0],
          fields: RESOURCE_FIELDS,
          resource: {
            name: newName
          }
        });
        return driveApiRequest(request);
      }
    }).then((response: FileResource) => {
      // Update the cache.
      Private.resourceCache.delete(oldPath);
      Private.resourceCache.set(newPath, response);

      return contentsModelForPath(newPath, false, fileTypeForPath);
    });
  }
}

/**
 * Copy a file in Google Drive. It is assumed that the new filename has
 * been determined previous to invoking this function, and does not conflict
 * with any files in the new directory.
 *
 * @param oldPath - The initial location of the file (where the path
 *   includes the filename).
 *
 * @param newPath - The location of the copy (where the path
 *   includes the filename). This cannot be the same as `oldPath`.
 *
 * @param fileTypeForPath - A function that, given a path argument, returns
 *   and DocumentRegistry.IFileType that is consistent with the path.
 *
 * @returns a promise fulfilled with the `Contents.IModel` of the copy.
 *   Otherwise, throws an error.
 */
export
function copyFile(oldPath: string, newPath: string, fileTypeForPath: (path: string) => DocumentRegistry.IFileType): Promise<Contents.IModel> {
  if (isDummy(PathExt.dirname(newPath))) {
    return Promise.reject(
      `GoogleDrive: "${newPath}" is not a valid target location`);
  }
  if( oldPath === newPath ) {
    return Promise.reject('Google Drive: cannot copy a file with'+
                ' the same name to the same directory');
  } else {
    let newFolderPath = PathExt.dirname(newPath);
    newFolderPath = newFolderPath === '.' ? '' : newFolderPath;

    // Get a promise that resolves with the resource in the current position.
    let resourcePromise = getResourceForPath(oldPath)
    // Get a promise that resolves with the resource of the new folder.
    let newFolderPromise = getResourceForPath(newFolderPath);

    // Check the new path to make sure there isn't already a file
    // with the same name there.
    let newName = PathExt.basename(newPath);
    let directorySearchPromise =
      searchDirectory(newFolderPath, 'name = \''+newName+'\'');

    // Once we have all the required information,
    // perform the copy.
    return Promise.all([resourcePromise, newFolderPromise,
                       directorySearchPromise]).then((values) => {
      let resource = values[0];
      let newFolder = values[1];
      let directorySearch = values[2];

      if(directorySearch.length !== 0) {
        throw new Error("Google Drive: File with the same name "+
                        "already exists in the destination directory");
      } else {
        let request = gapi.client.drive.files.copy({
          fileId: resource.id,
          fields: RESOURCE_FIELDS,
          resource: {
            parents: [newFolder.id],
            name: newName
          }
        });
        return driveApiRequest<FileResource>(request);
      }
    }).then((response) => {
      // Update the cache.
      Private.resourceCache.set(newPath, response);
      return contentsModelForPath(newPath, false, fileTypeForPath);
    });
  }
}


/* ******** Functions for dealing with revisions ******** */

/**
 * List the revisions for a file in Google Drive.
 *
 * @param path - the path of the file.
 *
 * @returns a promise fulfilled with a list of `Contents.ICheckpointModel`
 *   that correspond to the file revisions stored on drive.
 */
export
function listRevisions(path: string): Promise<Contents.ICheckpointModel[]> {
  return getResourceForPath(path).then((resource: FileResource) => {
    let request = gapi.client.drive.revisions.list({
      fileId: resource.id,
      fields: 'revisions(id, modifiedTime, keepForever)' //NOT DOCUMENTED
    });
    return driveApiRequest<gapi.client.drive.RevisionList>(request);
  }).then((result) => {
    let revisions = map(filter(result.revisions, (revision: RevisionResource) => {
      return revision.keepForever;
    }), (revision: RevisionResource) => {
      return { id: revision.id, last_modified: revision.modifiedTime }
    });
    return toArray(revisions);
  });
}

/**
 * Tell Google drive to keep the current revision. Without doing
 * this the revision would eventually be cleaned up.
 *
 * @param path - the path of the file to pin.
 *
 * @returns a promise fulfilled with an `ICheckpointModel` corresponding
 *   to the newly pinned revision.
 */
export
function pinCurrentRevision(path: string): Promise<Contents.ICheckpointModel> {
  return getResourceForPath(path).then((resource: FileResource) => {
    let request = gapi.client.drive.revisions.update({
      fileId: resource.id,
      revisionId: resource.headRevisionId,
      resource: {
        keepForever: true
      }
    });
    return driveApiRequest<RevisionResource>(request);
  }).then((revision) => {
    return { id: revision.id, last_modified: revision.modifiedTime };
  });
}

/**
 * Tell Google drive not to keep the current revision.
 * Eventually the revision will then be cleaned up.
 *
 * @param path - the path of the file to unpin.
 *
 * @param revisionId - the id of the revision to unpin.
 *
 * @returns a promise fulfilled when the revision is unpinned.
 */
export
function unpinRevision(path: string, revisionId: string): Promise<void> {
  return getResourceForPath(path).then((resource: FileResource) => {
    let request = gapi.client.drive.revisions.update({
      fileId: resource.id,
      revisionId: revisionId,
      resource: {
        keepForever: false
      }
    });
    return driveApiRequest<RevisionResource>(request);
  }).then(() => {
    return void 0;
  });
}

/**
 * Revert a file to a particular revision id.
 *
 * @param path - the path of the file.
 *
 * @param revisionId - the id of the revision to revert.
 *
 * @param fileType - a candidate DocumentRegistry.IFileType for the given file.
 *
 * @returns a promise fulfilled when the file is reverted.
 */
export
function revertToRevision(path: string, revisionId: string, fileType: DocumentRegistry.IFileType): Promise<void> {
  let revisionResource: FileResource;
  // Get the correct file resource.
  return getResourceForPath(path).then((resource: FileResource) => {
    revisionResource = resource;
    // Construct the request for a specific revision to the file.
    let downloadRequest = gapi.client.drive.revisions.get({
     fileId: revisionResource.id,
     revisionId: revisionId,
     alt: 'media'
    });
    // Make the request.
    return driveApiRequest<any>(downloadRequest);
  }).then((result: any) => {
    let content: any = result;
    if (fileType.fileFormat === 'base64') {
      content = btoa(result);
    } else if (revisionResource.mimeType === 'application/json') {
      content = JSON.stringify(result, null, 2);
    }
    let contents: Contents.IModel = {
      name: revisionResource.name,
      path: path,
      type: fileType.contentType,
      writable: revisionResource.capabilities.canEdit,
      created: String(revisionResource.createdTime),
      // TODO What is the appropriate modified time?
      last_modified: String(revisionResource.modifiedTime),
      mimetype: fileType.mimeTypes[0],
      content,
      format: fileType.fileFormat
    };

    // Reupload the reverted file to the head revision.
    return uploadFile(path, contents, fileType, true);
  }).then(() => {
    return void 0;
  });
}

/* *********Utility functions ********* */

/**
 * Construct a minimal files resource object from a
 * contents model.
 *
 * @param contents - The contents model.
 *
 * @param fileType - a candidate DocumentRegistry.IFileType for the given file.
 *
 * @returns a files resource object for the Google Drive API.
 *
 * #### Notes
 * This does not include any of the binary/text/json content of the
 * `contents`, just some metadata (`name` and `mimeType`).
 */
function fileResourceFromContentsModel(contents: Partial<Contents.IModel>, fileType: DocumentRegistry.IFileType): FileResource {
  let mimeType: string;
  switch(contents.type) {
    case 'notebook':
      // The Contents API does not specify a notebook mimetype,
      // but the Google Drive API requires one.
      mimeType = 'application/x-ipynb+json';
      break;
    case 'directory':
      mimeType = FOLDER_MIMETYPE;
      break;
    default:
      mimeType = fileType.mimeTypes[0];
      break;
  }
  return {
    name: contents.name,
    mimeType
  };
}

/**
 * Obtains the Google Drive Files resource for a file or folder relative
 * to the a given folder.  The path should be a file or a subfolder, and
 * should not contain multiple levels of folders (hence the name
 * pathComponent).  It should also not contain any leading or trailing
 * slashes.
 *
 * @param pathComponent - The file/folder to find
 *
 * @param type - type of resource (file or folder)
 *
 * @param folderId - The Google Drive folder id
 *
 * @returns A promise fulfilled by either the files resource for the given
 *   file/folder, or rejected with an Error object.
 */
function getResourceForRelativePath(pathComponent: string, folderId: string): Promise<FileResource> {
  return gapiInitialized.promise.then(() => {
    // Construct a search query for the file at hand.
    let query = 'name = \'' + pathComponent + '\' and trashed = false '
                + 'and \'' + folderId + '\' in parents';
    // Construct a request for the files matching the query.
    let request = gapi.client.drive.files.list({
      q: query,
      fields: 'files('+RESOURCE_FIELDS+')'
    });
    // Make the request.
    return driveApiRequest<gapi.client.drive.FileList>(request)
    .then((result) => {
      let files: FileResource[] = result.files;
      if (!files || files.length === 0) {
        throw Error(
          "Google Drive: cannot find the specified file/folder: "
          +pathComponent);
      } else if (files.length > 1) {
        throw Error(
          "Google Drive: multiple files/folders match: "
          +pathComponent);
      }
      return files[0];
    });
  });
}

/**
 * Given the unique id string for a file in Google Drive,
 * get the files resource metadata associated with it.
 *
 * @param id - The file ID.
 *
 * @returns A promise that resolves with the files resource
 *   corresponding to `id`.
 */
function resourceFromFileId(id: string): Promise<FileResource> {
  return gapiInitialized.promise.then(() => {
    let request = gapi.client.drive.files.get({
     fileId: id,
     fields: RESOURCE_FIELDS
    });
    return driveApiRequest<FileResource>(request).then((result) => {
      return result;
    });
  });
}

/**
 * Split a path into path components
 */
function splitPath(path: string): string[] {
  return path.split('/').filter((s,i,a) => (Boolean(s)));
}

/**
 * Whether a path is a dummy directory.
 */
export
function isDummy(path: string): boolean {
  return (path === COLLECTIONS_DIRECTORY || path === SHARED_DIRECTORY);
}

/**
 * Gets the Google Drive Files resource corresponding to a path.  The path
 * is always treated as an absolute path, no matter whether it contains
 * leading or trailing slashes.  In fact, all leading, trailing and
 * consecutive slashes are ignored.
 *
 * @param path - The path of the file.
 *
 * @param type - The type (file or folder)
 *
 * @returns A promise fulfilled with the files resource for the given path.
 *   or an Error object on error.
 */
export
function getResourceForPath(path: string): Promise<FileResource> {
  // First check the cache.
  if( Private.resourceCache.has(path)) {
    return Promise.resolve(Private.resourceCache.get(path));
  }

  let components = splitPath(path);

  if (components.length === 0) {
    // Handle the case for the pseudo folders
    // (i.e., the view onto the "My Drive" and "Shared
    // with me" directories, as well as the pseudo-root).
    return Promise.resolve(COLLECTIONS_DIRECTORY_RESOURCE);
  } else if (components.length === 1 && components[0] === DRIVE_DIRECTORY) {
    return resourceFromFileId('root');
  } else if (components.length === 1 && components[0] === SHARED_DIRECTORY) {
    return Promise.resolve(SHARED_DIRECTORY_RESOURCE);
  } else {
    // Create a Promise of a FileResource to walk the path until
    // we find the right file.
    let currentResource: Promise<FileResource>;
    let idx = 0; // Current path component index.

    if (components[0] === DRIVE_DIRECTORY) {
      // Handle the case of the `My Drive` directory.
      currentResource = Promise.resolve({ id: 'root' });
      idx = 1; // Set the component index to the second component
    } else if (components[0] === SHARED_DIRECTORY) {
      // Handle the case of the `Shared With Me` directory.
      currentResource = searchSharedFiles('name = \''+components[1]+'\'')
      .then(files => {
        if (!files || files.length === 0) {
          throw Error(
            "Google Drive: cannot find the specified file/folder: "
            +components[1]);
        } else if (files.length > 1) {
          throw Error(
            "Google Drive: multiple files/folders match: "
            +components[1]);
        }
        return files[0];
      });
      idx = 2; // Set the component index to the third component.
    } else {
      return Promise.reject('Unexpected file/folder in root directory');
    }

    // Loop through the remaining path components and get the resource for each
    // one, verifying that the path corresponds to a valid drive object.

    // Utility function that gets the file resource object given its name,
    // whether it is a file or a folder, and a promise for the resource 
    // object of its containing folder.
    let getResource = (pathComponent: string, parentResource: Promise<FileResource>) => {
      return parentResource.then((resource: FileResource) => {
        return getResourceForRelativePath(pathComponent, resource.id);
      });
    }

    // Loop over the components, updating the current resource.
    // Start the loop at one to skip the pseudo-root.
    for (; idx < components.length; idx++) {
      let component = components[idx];
      currentResource = getResource(component, currentResource);
    }

    // Update the cache.
    currentResource.then(r => {
      Private.resourceCache.set(path, r);
    });
    // Resolve with the final value of currentResource.
    return currentResource;
  }
}

/**
 * Download the contents of a file from Google Drive.
 *
 * @param resource - the files resource metadata object.
 *
 * @returns a promise fulfilled with the contents of the file.
 */
function downloadResource(resource: FileResource, picked: boolean = false): Promise<any> {
  return gapiInitialized.promise.then(() => {
    let request = gapi.client.drive.files.get({
     fileId: resource.id,
     alt: 'media'
    });
    return driveApiRequest<any>(request).then((result) => {
      return result;
    }).catch((error: any) => {
      throw error;
    });
  });
}

namespace Private {
  /**
   * A Map associating file paths with cached files
   * resources. This can significantly cut down on
   * API requests.
   */
  export
  let resourceCache = new Map<string, FileResource>();

  /**
   * When we list the contents of a directory we can
   * use that opportunity to refresh the cached values
   * for that directory. This function clears all
   * the cached resources that are in a given directory.
   */
  export
  function clearCacheForDirectory(path: string): void {
    // TODO: my TS compiler complains here?
    let keys = (resourceCache as any).keys();
    for(let key of keys) {
      let enclosingFolderPath = PathExt.dirname(path);
      enclosingFolderPath =
        enclosingFolderPath === '.' ? '' : enclosingFolderPath;
      if(path === enclosingFolderPath) {
        resourceCache.delete(key);
      }
    }
  }

  /**
   * Given a list of resources in a directory, put them in
   * the resource cache. This strips any duplicates, since
   * the path-based contents manager can't handle those correctly.
   */
  export
  function populateCacheForDirectory(path: string, resourceList: FileResource[]) {
    // Identify duplicates in the list: we can't handle those
    // correctly, so don't insert them.
    let duplicatePaths: string[] = [];
    let candidatePaths: string[] = [];
    for (let resource of resourceList) {
      let filePath = PathExt.join(path, resource.name);
      if (candidatePaths.indexOf(filePath) !== -1) {
        duplicatePaths.push(filePath);
      } else {
        candidatePaths.push(filePath);
      }
    }

    // Insert non-duplicates into the cache.
    for (let resource of resourceList) {
      let filePath = PathExt.join(path, resource.name);
      if (duplicatePaths.indexOf(filePath) === -1 ) {
        Private.resourceCache.set(filePath, resource);
      }
    }
  }
}
