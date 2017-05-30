// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

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
  driveApiRequest, driveReady, pickFile
} from '../gapi';

//TODO: Complete gapi typings and commit upstream
declare let gapi: any;

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
 * Type stub for a files resource returned by
 * the Google Drive API.
 */
export
type FilesResource = any;

/**
 * Type stub for a Google Drive API request
 */
export
type DriveApiRequest = any;

/**
 * Type stub for a Google Drive revision resource.
 */
export
type RevisionResource = any;

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
  return getResourceForPath(path).then((resource: FilesResource) => {
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
 * @param exisiting - whether the file exists.
 *
 * @returns a promise fulfulled with the `Contents.IModel` that has been uploaded,
 *   or throws an Error if it fails.
 */
export
function uploadFile(path: string, model: Contents.IModel, existing: boolean = false): Promise<Contents.IModel> {
  let resourceReadyPromise = Promise.resolve(void 0);
  if(existing) {
    resourceReadyPromise = getResourceForPath(path)
  } else {
    resourceReadyPromise = new Promise<FilesResource>((resolve, reject) => {
      let enclosingFolderPath =
        PathExt.join(...splitPath(path).slice(0,-1));
      let resource: FilesResource = fileResourceFromContentsModel(model);
      getResourceForPath(enclosingFolderPath)
      .then((parentFolderResource: FilesResource) => {
        if(parentFolderResource.mimeType !== FOLDER_MIMETYPE) {
           throw new Error("Google Drive: expected a folder: "+path);
        }
        resource['parents'] = [parentFolderResource.id];
        resolve(resource);
      });
    });
  }
  return resourceReadyPromise.then((resource: FilesResource) => {
    // Construct the HTTP request: first the metadata,
    // then the content of the uploaded file.

    let delimiter = '\r\n--' + MULTIPART_BOUNDARY + '\r\n';
    let closeDelim = '\r\n--' + MULTIPART_BOUNDARY + '--';
    let mime = resource.mimeType;
    switch(model.type) {
      case 'notebook':
        mime = 'application/ipynb';
        break;
      case 'directory':
        mime = FOLDER_MIMETYPE;
        break;
    }

    // Metatdata part.
    let body = delimiter+'Content-Type: application/json\r\n\r\n';
    // Don't update metadata if the file already exists.
    if(!existing) {
      body += JSON.stringify(resource);
    }
    body += delimiter;

    // Content of the file.
    body += 'Content-Type: ' + mime + '\r\n';
    if (model.format === 'base64') {
      body += 'Content-Transfer-Encoding: base64\r\n';
      body +='\r\n' + model.content + closeDelim;
    } else {
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

    return driveApiRequest(request);
  }).then( (result: FilesResource) => {
    console.log("gapi: uploaded document to "+result.id);
    // Update the cache.
    Private.resourceCache.set(path, result);

    return contentsModelFromFileResource(result, path, true);
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
 * @param includeContents - whether to download the actual text/json/binary
 *   content from the server. This takes much more bandwidth, so should only
 *   be used when required.
 *
 * @returns a promise fulfilled with the Contents.IModel for the resource.
 */
export
function contentsModelFromFileResource(resource: FilesResource, path: string, includeContents: boolean = false): Promise<Contents.IModel> {
  // Handle the case of getting the contents of a directory.
  if(resource.mimeType === FOLDER_MIMETYPE) {
    // Enter contents metadata.
    let contents: any = {
      name: resource.name,
      path: path,
      type: 'directory',
      writable: resource.capabilities.canEdit,
      created: String(resource.createdTime),
      last_modified: String(resource.modifiedTime),
      mimetype: null,
      content: null,
      format: 'json'
    };

    // Get directory listing if applicable.
    if (includeContents) {
      let fileList: FilesResource[] = [];
      return searchDirectory(path).then( (resources: FilesResource[]) => {
        //Update the cache.
        Private.clearCacheForDirectory(path);
        Private.populateCacheForDirectory(path, resources);

        let currentContents = Promise.resolve({});

        for(let i = 0; i<resources.length; i++) {
          let currentResource = resources[i];
          let resourcePath = path ?
                             path+'/'+currentResource.name :
                             currentResource.name;
          currentContents = contentsModelFromFileResource(
            currentResource, resourcePath, false);
          currentContents.then((contents: Contents.IModel) => {
            fileList.push(contents);
          });
        }
        return currentContents;
      }).then(() => {
        contents.content = fileList;
        return contents as Contents.IModel;
      });
    } else {
      return Promise.resolve(contents as Contents.IModel);
    }
  } else {
    // Handle the case of getting the contents of a file.
    let contentType: Contents.ContentType;
    let mimeType: string;
    let format: Contents.FileFormat;
    if(resource.mimeType === 'application/ipynb' ||
       resource.mimeType === 'application/json' ||
       resource.name.indexOf('.ipynb') !== -1) {
      contentType = 'notebook';
      format = 'json';
      mimeType = null;
    } else if(resource.mimeType === 'text/plain') {
      contentType = 'file';
      format = 'text';
      mimeType = 'text/plain';
    } else {
      contentType = 'file';
      format = 'base64';
      mimeType = 'application/octet-stream';
    }
    let contents: any = {
      name: resource.name,
      path: path,
      type: contentType,
      writable: resource.capabilities.canEdit,
      created: String(resource.createdTime),
      last_modified: String(resource.modifiedTime),
      mimetype: mimeType,
      content: null,
      format: format
    };
    // Download the contents from the server if necessary.
    if(includeContents) {
      return downloadResource(resource).then((result: any) => {
        contents.content = result;
        return contents as Contents.IModel;
      });
    } else {
      return Promise.resolve(contents as Contents.IModel);
    }
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
 * @returns a promise fulfilled with the `Contents.IModel` of the appropriate file.
 *   Otherwise, throws an error.
 */
export
function contentsModelForPath(path: string, includeContents: boolean = false): Promise<Contents.IModel> {
  return getResourceForPath(path).then((resource: FilesResource) => {
    return contentsModelFromFileResource(resource, path, includeContents)
  });
}


/* ********* Functions for file creation/deletion ************** */

/**
 * Give edit permissions to a Google drive user.
 *
 * @param fileId - the ID of the file.
 *
 * @param emailAddress - the email address of the user for which
 *   to create the permissions.
 *
 * @returns a promise fulfilled when the permissions are created.
 */
export
function createPermissions (fileId: string, emailAddress: string ): Promise<void> {
  let permissionRequest = {
    'type': 'user',
    'role': 'writer',
    'emailAddress': emailAddress
  }
  let request = gapi.client.drive.permissions.create({
    'fileId': fileId,
    'emailMessage': fileId,
    'sendNotificationEmail': true,
    'resource': permissionRequest
  });
  return driveApiRequest(request).then( (result: any) => {
    console.log("gapi: created permissions for "+emailAddress);
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
  return driveApiRequest(request).then( (result: FilesResource) => {
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
function loadRealtimeDocument(resource: FilesResource, picked: boolean = false): Promise<gapi.drive.realtime.Document> {
  return new Promise((resolve, reject) => {
    driveReady.then(() => {
      console.log("gapi: attempting to load realtime file " + resource.id);
      gapi.drive.realtime.load(resource.id, (doc: gapi.drive.realtime.Document ): any => {
        resolve(doc);
      }, (model: any) => {
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
  return getResourceForPath(path).then((resource: FilesResource) => {
    let request: DriveApiRequest = gapi.client.drive.files.delete({fileId: resource.id});
    return driveApiRequest(request, 204);
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
function searchDirectory(path: string, query: string = ''): Promise<FilesResource[]> {
  return getResourceForPath(path).then((resource: FilesResource) => {
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
  }).then((result: any) => {
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
 * @returns a promise fulfilled with the `Contents.IModel` of the moved file.
 *   Otherwise, throws an error.
 */
export
function moveFile(oldPath: string, newPath: string): Promise<Contents.IModel> {
  if( oldPath === newPath ) {
    return contentsModelForPath(oldPath);
  } else {
    let pathComponents = splitPath(newPath);
    let newFolderPath = PathExt.join(...pathComponents.slice(0,-1));

    // Get a promise that resolves with the resource in the current position.
    let resourcePromise = getResourceForPath(oldPath)
    // Get a promise that resolves with the resource of the new folder.
    let newFolderPromise = getResourceForPath(newFolderPath);

    // Check the new path to make sure there isn't already a file
    // with the same name there.
    let newName = pathComponents.slice(-1)[0];
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
        let request: DriveApiRequest = gapi.client.drive.files.update({
          fileId: resource.id,
          addParents: newFolder.id,
          removeParents: resource.parents[0],
          name: newName,
          fields: RESOURCE_FIELDS
        });
        return driveApiRequest(request);
      }
    }).then((response: FilesResource) => {
      // Update the cache.
      Private.resourceCache.delete(oldPath);
      Private.resourceCache.set(newPath, response);

      return contentsModelForPath(newPath);
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
 * @returns a promise fulfilled with the `Contents.IModel` of the copy.
 *   Otherwise, throws an error.
 */
export
function copyFile(oldPath: string, newPath: string): Promise<Contents.IModel> {
  if( oldPath === newPath ) {
    throw Error('Google Drive: cannot copy a file with'+
                ' the same name to the same directory');
  } else {
    let pathComponents = splitPath(newPath);
    let newFolderPath = PathExt.join(...pathComponents.slice(0,-1));

    // Get a promise that resolves with the resource in the current position.
    let resourcePromise = getResourceForPath(oldPath)
    // Get a promise that resolves with the resource of the new folder.
    let newFolderPromise = getResourceForPath(newFolderPath);

    // Check the new path to make sure there isn't already a file
    // with the same name there.
    let newName = pathComponents.slice(-1)[0];
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
        let request: DriveApiRequest = gapi.client.drive.files.copy({
          fileId: resource.id,
          parents: [newFolder.id],
          name: newName,
          fields: RESOURCE_FIELDS
        });
        return driveApiRequest(request);
      }
    }).then((response: FilesResource) => {
      // Update the cache.
      Private.resourceCache.set(newPath, response);
      return contentsModelForPath(newPath);
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
  return getResourceForPath(path).then((resource: FilesResource) => {
    let request: DriveApiRequest = gapi.client.drive.revisions.list({
      fileId: resource.id,
      fields: 'revisions(id, modifiedTime, keepForever)' //NOT DOCUMENTED
    });
    return driveApiRequest(request);
  }).then((result: any) => {
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
  return getResourceForPath(path).then((resource: FilesResource) => {
    let request: DriveApiRequest = gapi.client.drive.revisions.update({
      fileId: resource.id,
      revisionId: resource.headRevisionId,
      keepForever: true
    });
    return driveApiRequest(request);
  }).then((revision: RevisionResource) => {
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
  return getResourceForPath(path).then((resource: FilesResource) => {
    let request: DriveApiRequest = gapi.client.drive.revisions.update({
      fileId: resource.id,
      revisionId: revisionId,
      keepForever: false
    });
    return driveApiRequest(request);
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
 * @returns a promise fulfilled when the file is reverted.
 */
export
function revertToRevision(path: string, revisionId: string): Promise<void> {
  let revisionResource: RevisionResource;
  // Get the correct file resource.
  return getResourceForPath(path).then((resource: FilesResource) => {
    revisionResource = resource;
    // Construct the request for a specific revision to the file.
    let downloadRequest: DriveApiRequest = gapi.client.drive.revisions.get({
     fileId: revisionResource.id,
     revisionId: revisionId,
     alt: 'media'
    });
    // Make the request.
    return driveApiRequest(downloadRequest);
  }).then((result: any) => {

    let contentType: Contents.ContentType;
    let mimeType: string;
    let format: Contents.FileFormat;
    if(revisionResource.mimeType === 'application/ipynb' ||
       revisionResource.mimeType === 'application/json') {
      contentType = 'notebook';
      format = 'json';
      mimeType = null;
    } else if(revisionResource.mimeType === 'text/plain') {
      contentType = 'file';
      format = 'text';
      mimeType = 'text/plain';
    } else {
      contentType = 'file';
      format = 'base64';
      mimeType = 'application/octet-stream';
    }
    // Reconstruct the Contents.IModel from the retrieved contents.
    let contents: Contents.IModel = {
      name: revisionResource.name,
      path: path,
      type: contentType,
      writable: revisionResource.capabilities.canEdit,
      created: String(revisionResource.createdTime),
      // TODO What is the appropriate modified time?
      last_modified: String(revisionResource.modifiedTime),
      mimetype: mimeType,
      content: result,
      format: format
    };

    // Reupload the reverted file to the head revision.
    return uploadFile(path, contents, true);
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
 * @returns a files resource object for the Google Drive API.
 *
 * #### Notes
 * This does not include any of the binary/text/json content of the
 * `contents`, just some metadata (`name` and `mimeType`).
 */
function fileResourceFromContentsModel(contents: Contents.IModel): FilesResource {
  let mimeType = '';
  switch (contents.type) {
    case 'directory':
      mimeType = FOLDER_MIMETYPE;
      break;
    case 'notebook':
      mimeType = 'application/ipynb';
      break;
    case 'file':
      if(contents.format) {
        if(contents.format === 'text')
          mimeType = 'text/plain';
        else if (contents.format === 'base64')
          mimeType = 'application/octet-stream';
      }
      break;
    default:
      throw new Error('Invalid contents type');
  }
  return {
    name: contents.name,
    mimeType: mimeType
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
function getResourceForRelativePath(pathComponent: string, folderId: string): Promise<FilesResource> {
  // Construct a search query for the file at hand.
  let query = 'name = \'' + pathComponent + '\' and trashed = false '
              + 'and \'' + folderId + '\' in parents';
  // Construct a request for the files matching the query.
  let request: string = gapi.client.drive.files.list({
    q: query,
    fields: 'files('+RESOURCE_FIELDS+')'
  });
  // Make the request.
  return driveApiRequest(request).then((result: any) => {
    let files: FilesResource[] = result.files;
    if (!files || files.length === 0) {
      return Promise.reject(
        "Google Drive: cannot find the specified file/folder: "
        +pathComponent);
    } else if (files.length > 1) {
      return Promise.reject(
        "Google Drive: multiple files/folders match: "
        +pathComponent);
    }
    return files[0];
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
function resourceFromFileId(id: string): Promise<FilesResource> {
  let request: DriveApiRequest = gapi.client.drive.files.get({
   fileId: id,
   fields: RESOURCE_FIELDS
  });
  return driveApiRequest(request).then((result: FilesResource) => {
    return result;
  });
}

/**
 * Split a path into path components
 */
function splitPath(path: string): string[] {
  return path.split('/').filter((s,i,a) => (Boolean(s)));
};

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
function getResourceForPath(path: string): Promise<FilesResource> {
  // First check the cache.
  if( Private.resourceCache.has(path)) {
    return Promise.resolve(Private.resourceCache.get(path));
  }

  let components = splitPath(path);

  if (components.length === 0) {
    // Handle the case for the root folder.
    return resourceFromFileId('root');
  } else {
    // Loop through the path components and get the resource for each
    // one, verifying that the path corresponds to a valid drive object.

    // Utility function that gets the file resource object given its name,
    // whether it is a file or a folder, and a promise for the resource 
    // object of its containing folder.
    let getResource = function(pathComponent: string, parentResource: Promise<FilesResource>): Promise<FilesResource> {
      return parentResource.then((resource: FilesResource) => {
        return getResourceForRelativePath(pathComponent, resource['id']);
      });
    }

    // We start with the root directory:
    let currentResource: Promise<FilesResource> = Promise.resolve({id: 'root'});

    // Loop over the components, updating the current resource.
    for (let i = 0; i < components.length; i++) {
      let component = components[i];
      currentResource = getResource(component, currentResource);
    }

    // Update the cache.
    Private.resourceCache.set(path, currentResource);
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
function downloadResource(resource: FilesResource, picked: boolean = false): Promise<any> {
  let request: DriveApiRequest = gapi.client.drive.files.get({
   fileId: resource.id,
   alt: 'media'
  });
  return driveApiRequest(request).then((result: any) => {
    return result;
  }).catch((error: any) => {
    // If the request failed, there may be insufficient
    // permissions to download this file. Try to choose
    // it with a picker to explicitly grant permission.
    if(error.xhr.responseText === 'appNotAuthorizedToFile'
       && picked === false) {
      return pickFile(resource).then(() => {
        return downloadResource(resource, true);
      }).catch(() => {
        throw error;
      });
    } else {
      throw error;
    }
  });
}

namespace Private {
  /**
   * A Map associating file paths with cached files
   * resources. This can significantly cut down on
   * API requests.
   */
  export
  let resourceCache = new Map<string, FilesResource>();

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
      let enclosingFolderPath =
        PathExt.join(...splitPath(key).slice(0,-1));
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
  function populateCacheForDirectory(path: string, resourceList: any[]) {
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
