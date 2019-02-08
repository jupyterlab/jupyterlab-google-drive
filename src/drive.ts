// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

// tslint:disable-next-line
/// <reference path="./gapi.client.drive.d.ts" />

import { map, filter, toArray } from '@phosphor/algorithm';

import { Contents } from '@jupyterlab/services';

import { PathExt } from '@jupyterlab/coreutils';

import { DocumentRegistry } from '@jupyterlab/docregistry';

import {
  driveApiRequest,
  gapiAuthorized,
  gapiInitialized,
  makeError
} from './gapi';

import * as base64js from 'base64-js';

/**
 * Fields to request for File resources.
 */
const RESOURCE_FIELDS =
  'kind,id,name,mimeType,trashed,headRevisionId,' +
  'parents,modifiedTime,createdTime,capabilities,' +
  'webContentLink,teamDriveId';

/**
 * Fields to request for Team Drive resources.
 */
const TEAMDRIVE_FIELDS = 'kind,id,name,capabilities';

/**
 * Fields to request for Revision resources.
 */
const REVISION_FIELDS = 'id, modifiedTime, keepForever';

/**
 * Fields to request for File listings.
 */
const FILE_LIST_FIELDS = 'nextPageToken';

/**
 * Fields to reuest for Team Drive listings.
 */
const TEAMDRIVE_LIST_FIELDS = 'nextPageToken';

/**
 * Fields to reuest for Team Drive listings.
 */
const REVISION_LIST_FIELDS = 'nextPageToken';

/**
 * Page size for file listing (max allowable).
 */
const FILE_PAGE_SIZE = 1000;

/**
 * Page size for team drive listing (max allowable).
 */
const TEAMDRIVE_PAGE_SIZE = 100;

/**
 * Page size for revision listing (max allowable).
 */
const REVISION_PAGE_SIZE = 1000;

export const RT_MIMETYPE = 'application/vnd.google-apps.drive-sdk';
export const FOLDER_MIMETYPE = 'application/vnd.google-apps.folder';
export const FILE_MIMETYPE = 'application/vnd.google-apps.file';

const MULTIPART_BOUNDARY = '-------314159265358979323846';

/**
 * Type alias for a files resource returned by
 * the Google Drive API.
 */
export type FileResource = gapi.client.drive.File;

/**
 * Type alias for a Google Drive revision resource.
 */
export type RevisionResource = gapi.client.drive.Revision;

/**
 * Type stub for a Team Drive resource.
 */
export type TeamDriveResource = gapi.client.drive.TeamDrive;

/**
 * An API response which may be paginated.
 */
type PaginatedResponse =
  | gapi.client.drive.FileList
  | gapi.client.drive.TeamDriveList
  | gapi.client.drive.RevisionList;

/**
 * Alias for directory IFileType.
 */
const directoryFileType = DocumentRegistry.defaultDirectoryFileType;

/**
 * The name of the dummy "Shared with me" folder.
 */
const SHARED_DIRECTORY = 'Shared with me';

/**
 * The path of the dummy pseudo-root folder.
 */
const COLLECTIONS_DIRECTORY = '';

/**
 * A dummy files resource for the "Shared with me" folder.
 */
const SHARED_DIRECTORY_RESOURCE: FileResource = {
  kind: 'dummy',
  name: SHARED_DIRECTORY
};

/**
 * A dummy files resource for the pseudo-root folder.
 */
const COLLECTIONS_DIRECTORY_RESOURCE: FileResource = {
  kind: 'dummy',
  name: ''
};

/* ****** Functions for uploading/downloading files ******** */

/**
 * Get a download URL for a file path.
 *
 * @param path - the path corresponding to the file.
 *
 * @returns a promise that resolves with the download URL.
 */
export async function urlForFile(path: string): Promise<string> {
  const resource = await getResourceForPath(path);
  return resource.webContentLink!;
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
export async function uploadFile(
  path: string,
  model: Partial<Contents.IModel>,
  fileType: DocumentRegistry.IFileType,
  existing: boolean = false,
  fileTypeForPath:
    | ((path: string) => DocumentRegistry.IFileType)
    | undefined = undefined
): Promise<Contents.IModel> {
  if (isDummy(PathExt.dirname(path)) && !existing) {
    throw makeError(
      400,
      `Google Drive: "${path}"` + ' is not a valid save directory'
    );
  }
  let resourceReadyPromise: Promise<FileResource>;
  if (existing) {
    resourceReadyPromise = getResourceForPath(path);
  } else {
    resourceReadyPromise = new Promise<FileResource>(
      async (resolve, reject) => {
        let enclosingFolderPath = PathExt.dirname(path);
        const resource: FileResource = fileResourceFromContentsModel(
          model,
          fileType
        );
        const parentFolderResource = await getResourceForPath(
          enclosingFolderPath
        );
        if (!isDirectory(parentFolderResource)) {
          throw new Error('Google Drive: expected a folder: ' + path);
        }
        if (parentFolderResource.kind === 'drive#teamDrive') {
          resource.teamDriveId = parentFolderResource.id;
        } else if (parentFolderResource.teamDriveId) {
          resource.teamDriveId = parentFolderResource.teamDriveId;
        }
        resource.parents = [parentFolderResource.id!];
        resolve(resource);
      }
    );
  }
  const resource = await resourceReadyPromise;
  // Construct the HTTP request: first the metadata,
  // then the content of the uploaded file.

  const delimiter = '\r\n--' + MULTIPART_BOUNDARY + '\r\n';
  const closeDelim = '\r\n--' + MULTIPART_BOUNDARY + '--';

  // Metatdata part.
  let body = delimiter + 'Content-Type: application/json\r\n\r\n';
  // Don't update metadata if the file already exists.
  if (!existing) {
    body += JSON.stringify(resource);
  }
  body += delimiter;

  // Content of the file.
  body += 'Content-Type: ' + resource.mimeType + '\r\n';
  // It is not well documented, but as can be seen in
  // filebrowser/src/model.ts, anything that is not a
  // notebook is a base64 encoded string.
  if (model.format === 'base64') {
    body += 'Content-Transfer-Encoding: base64\r\n';
    body += '\r\n' + model.content + closeDelim;
  } else if (model.format === 'text') {
    // If it is already a text string, just send that.
    body += '\r\n' + model.content + closeDelim;
  } else {
    // Notebook case.
    body += '\r\n' + JSON.stringify(model.content) + closeDelim;
  }

  let apiPath = '/upload/drive/v3/files';
  let method = 'POST';

  if (existing) {
    method = 'PATCH';
    apiPath = apiPath + '/' + resource.id;
  }

  const createRequest = () => {
    return gapi.client.request({
      path: apiPath,
      method: method,
      params: {
        uploadType: 'multipart',
        supportsTeamDrives: !!resource.teamDriveId,
        fields: RESOURCE_FIELDS
      },
      headers: {
        'Content-Type':
          'multipart/related; boundary="' + MULTIPART_BOUNDARY + '"'
      },
      body: body
    });
  };

  const result = await driveApiRequest<FileResource>(createRequest);
  // Update the cache.
  Private.resourceCache.set(path, result);

  return contentsModelFromFileResource(
    result,
    path,
    fileType,
    true,
    fileTypeForPath
  );
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
export async function contentsModelFromFileResource(
  resource: FileResource,
  path: string,
  fileType: DocumentRegistry.IFileType,
  includeContents: boolean,
  fileTypeForPath:
    | ((path: string) => DocumentRegistry.IFileType)
    | undefined = undefined
): Promise<Contents.IModel> {
  // Handle the exception of the dummy directories
  if (resource.kind === 'dummy') {
    return contentsModelFromDummyFileResource(
      resource,
      path,
      includeContents,
      fileTypeForPath
    );
  }
  // Handle the case of getting the contents of a directory.
  if (isDirectory(resource)) {
    // Enter contents metadata.
    const contents: Contents.IModel = {
      name: resource.name!,
      path: path,
      type: 'directory',
      writable: resource.capabilities!.canEdit || true,
      created: resource.createdTime || '',
      last_modified: resource.modifiedTime || '',
      mimetype: fileType.mimeTypes[0],
      content: null,
      format: 'json'
    };

    // Get directory listing if applicable.
    if (includeContents) {
      if (!fileTypeForPath) {
        throw Error(
          'Must include fileTypeForPath argument to get directory listing'
        );
      }
      const fileList: FileResource[] = [];
      const resources = await searchDirectory(path);
      // Update the cache.
      Private.clearCacheForDirectory(path);
      Private.populateCacheForDirectory(path, resources);

      let currentContents = Promise.resolve({});

      for (let i = 0; i < resources.length; i++) {
        const currentResource = resources[i];
        const resourcePath = path
          ? path + '/' + currentResource.name!
          : currentResource.name!;
        const resourceFileType = fileTypeForPath(resourcePath);
        currentContents = contentsModelFromFileResource(
          currentResource,
          resourcePath,
          resourceFileType,
          false
        );
        fileList.push(await currentContents);
      }
      return { ...contents, content: fileList };
    } else {
      return contents;
    }
  } else {
    // Handle the case of getting the contents of a file.
    const contents: Contents.IModel = {
      name: resource.name!,
      path: path,
      type: fileType.contentType,
      writable: resource.capabilities!.canEdit || true,
      created: resource.createdTime || '',
      last_modified: resource.modifiedTime || '',
      mimetype: fileType.mimeTypes[0],
      content: null,
      format: fileType.fileFormat
    };
    // Download the contents from the server if necessary.
    if (includeContents) {
      const result: any = await downloadResource(resource);
      let content = result;
      if (contents.format === 'json') {
        content = JSON.parse(result);
      } else if (contents.format === 'base64') {
        content = Private.b64EncodeUTF8(result);
      }
      return { ...contents, content };
    } else {
      return contents;
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
async function contentsModelFromDummyFileResource(
  resource: FileResource,
  path: string,
  includeContents: boolean,
  fileTypeForPath: ((path: string) => DocumentRegistry.IFileType) | undefined
): Promise<Contents.IModel> {
  // Construct the empty Contents.IModel.
  const contents: Contents.IModel = {
    name: resource.name!,
    path: path,
    type: 'directory',
    writable: false,
    created: '',
    last_modified: '',
    content: null,
    mimetype: '',
    format: 'json'
  };
  if (includeContents && !fileTypeForPath) {
    throw Error(
      'Must include fileTypeForPath argument to get directory listing'
    );
  }
  if (resource.name === SHARED_DIRECTORY && includeContents) {
    // If `resource` is the SHARED_DIRECTORY_RESOURCE, and we
    // need the file listing for it, then get them.
    const fileList: Contents.IModel[] = [];
    const resources = await searchSharedFiles();
    // Update the cache.
    Private.clearCacheForDirectory(path);
    Private.populateCacheForDirectory(path, resources);

    let currentContents: Promise<any> | undefined;

    for (let i = 0; i < resources.length; i++) {
      const currentResource = resources[i];
      const resourcePath = path
        ? path + '/' + currentResource.name
        : currentResource.name!;
      const resourceFileType = fileTypeForPath!(resourcePath);
      currentContents = contentsModelFromFileResource(
        currentResource,
        resourcePath,
        resourceFileType,
        false,
        fileTypeForPath
      );
      fileList.push(await currentContents);
    }
    const content = fileList;
    return { ...contents, content };
  } else if (resource.name === COLLECTIONS_DIRECTORY && includeContents) {
    // If `resource` is the pseudo-root directory, construct
    // a contents model for it.
    const sharedContentsPromise = contentsModelFromFileResource(
      SHARED_DIRECTORY_RESOURCE,
      SHARED_DIRECTORY,
      directoryFileType,
      false,
      undefined
    );
    const rootContentsPromise = resourceFromFileId('root').then(
      rootResource => {
        return contentsModelFromFileResource(
          rootResource,
          rootResource.name || '',
          directoryFileType,
          false,
          undefined
        );
      }
    );
    const teamDrivesContentsPromise = listTeamDrives().then(drives => {
      const drivePromises: Promise<Contents.IModel>[] = [];
      for (let drive of drives) {
        drivePromises.push(
          contentsModelFromFileResource(
            drive,
            drive.name!,
            directoryFileType,
            false,
            undefined
          )
        );
      }
      return Promise.all(drivePromises);
    });

    const c = await Promise.all([
      rootContentsPromise,
      sharedContentsPromise,
      teamDrivesContentsPromise
    ]);
    const rootItems = c[2];
    rootItems.unshift(c[1]);
    rootItems.unshift(c[0]);
    return { ...contents, content: rootItems };
  } else {
    // Otherwise return the (mostly) empty contents model.
    return contents;
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
export async function contentsModelForPath(
  path: string,
  includeContents: boolean,
  fileTypeForPath: (path: string) => DocumentRegistry.IFileType
): Promise<Contents.IModel> {
  const fileType = fileTypeForPath(path);
  const resource = await getResourceForPath(path);
  const contents = await contentsModelFromFileResource(
    resource,
    path,
    fileType,
    includeContents,
    fileTypeForPath
  );
  return contents;
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
export async function createPermissions(
  resource: FileResource,
  emailAddresses: string[]
): Promise<void> {
  // Do nothing for an empty list.
  if (emailAddresses.length === 0) {
    return;
  }
  const createRequest = () => {
    // Create a batch request for permissions.
    // Note: the typings for gapi.client are missing
    // the newBatch() function, which creates an HttpBatchRequest
    const batch: any = (gapi as any).client.newBatch();
    for (let address of emailAddresses) {
      const permissionRequest = {
        type: 'user',
        role: 'writer',
        emailAddress: address
      };
      const request = gapi.client.drive.permissions.create({
        fileId: resource.id!,
        emailMessage: `${resource.name} has been shared with you`,
        sendNotificationEmail: true,
        resource: permissionRequest,
        supportsTeamDrives: !!resource.teamDriveId
      });
      batch.add(request);
    }
    return batch;
  };
  // Submit the batch request.
  await driveApiRequest<any>(createRequest);
  return;
}

/**
 * Delete a file from the users Google Drive.
 *
 * @param path - the path of the file to delete.
 *
 * @returns a promise fulfilled when the file has been deleted.
 */
export async function deleteFile(path: string): Promise<void> {
  const resource = await getResourceForPath(path);
  const createRequest = () => {
    return gapi.client.drive.files.delete({
      fileId: resource.id!,
      supportsTeamDrives: !!resource.teamDriveId
    });
  };
  await driveApiRequest<void>(createRequest, 204);
  // Update the cache
  Private.resourceCache.delete(path);
  return;
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
export async function searchDirectory(
  path: string,
  query: string = ''
): Promise<FileResource[]> {
  const resource = await getResourceForPath(path);
  // Check to make sure this is a folder.
  if (!isDirectory(resource)) {
    throw new Error('Google Drive: expected a folder: ' + path);
  }
  // Construct the query.
  let fullQuery: string =
    `\'${resource.id}\' in parents ` + 'and trashed = false';
  if (query) {
    fullQuery += ' and ' + query;
  }

  const getPage = (pageToken?: string) => {
    let createRequest: () => gapi.client.HttpRequest<
      gapi.client.drive.FileList
    >;
    if (resource.teamDriveId) {
      // Case of a directory in a team drive.
      createRequest = () => {
        return gapi.client.drive.files.list({
          q: fullQuery,
          pageSize: FILE_PAGE_SIZE,
          pageToken,
          fields: `${FILE_LIST_FIELDS}, files(${RESOURCE_FIELDS})`,
          corpora: 'teamDrive',
          includeTeamDriveItems: true,
          supportsTeamDrives: true,
          teamDriveId: resource.teamDriveId
        });
      };
    } else if (resource.kind === 'drive#teamDrive') {
      // Case of the root of a team drive.
      createRequest = () => {
        return gapi.client.drive.files.list({
          q: fullQuery,
          pageSize: FILE_PAGE_SIZE,
          pageToken,
          fields: `${FILE_LIST_FIELDS}, files(${RESOURCE_FIELDS})`,
          corpora: 'teamDrive',
          includeTeamDriveItems: true,
          supportsTeamDrives: true,
          teamDriveId: resource.id!
        });
      };
    } else {
      // Case of the user directory.
      createRequest = () => {
        return gapi.client.drive.files.list({
          q: fullQuery,
          pageSize: FILE_PAGE_SIZE,
          pageToken,
          fields: `${FILE_LIST_FIELDS}, files(${RESOURCE_FIELDS})`
        });
      };
    }
    return driveApiRequest(createRequest);
  };
  return depaginate(getPage, 'files');
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
 *
 * ### Notes
 * This does not search Team Drives.
 */
export async function searchSharedFiles(
  query: string = ''
): Promise<FileResource[]> {
  await gapiInitialized.promise;
  // Construct the query.
  let fullQuery = 'sharedWithMe = true';
  if (query) {
    fullQuery += ' and ' + query;
  }

  const getPage = (pageToken?: string) => {
    const createRequest = () => {
      return gapi.client.drive.files.list({
        q: fullQuery,
        pageSize: FILE_PAGE_SIZE,
        pageToken,
        fields: `${FILE_LIST_FIELDS}, files(${RESOURCE_FIELDS})`
      });
    };
    return driveApiRequest(createRequest);
  };
  return depaginate(getPage, 'files');
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
export async function moveFile(
  oldPath: string,
  newPath: string,
  fileTypeForPath: (path: string) => DocumentRegistry.IFileType
): Promise<Contents.IModel> {
  if (isDummy(PathExt.dirname(newPath))) {
    throw makeError(
      400,
      `Google Drive: "${newPath}" ` + 'is not a valid save directory'
    );
  }
  if (oldPath === newPath) {
    return contentsModelForPath(oldPath, true, fileTypeForPath);
  } else {
    let newFolderPath = PathExt.dirname(newPath);

    // Get a promise that resolves with the resource in the current position.
    const resourcePromise = getResourceForPath(oldPath);
    // Get a promise that resolves with the resource of the new folder.
    const newFolderPromise = getResourceForPath(newFolderPath);

    // Check the new path to make sure there isn't already a file
    // with the same name there.
    const newName = PathExt.basename(newPath);
    const directorySearchPromise = searchDirectory(
      newFolderPath,
      "name = '" + newName + "'"
    );

    // Once we have all the required information,
    // update the metadata with the new parent directory
    // for the file.
    const values = await Promise.all([
      resourcePromise,
      newFolderPromise,
      directorySearchPromise
    ]);
    const resource = values[0];
    const newFolder = values[1];
    const directorySearch = values[2];

    if (directorySearch.length !== 0) {
      throw new Error(
        'Google Drive: File with the same name ' +
          'already exists in the destination directory'
      );
    } else {
      const createRequest = () => {
        return gapi.client.drive.files.update({
          fileId: resource.id!,
          addParents: newFolder.id!,
          removeParents: resource.parents ? resource.parents[0] : undefined,
          resource: {
            name: newName
          },
          fields: RESOURCE_FIELDS,
          supportsTeamDrives: !!(resource.teamDriveId || newFolder.teamDriveId)
        });
      };
      const response = await driveApiRequest<FileResource>(createRequest);
      // Update the cache.
      Private.resourceCache.delete(oldPath);
      Private.resourceCache.set(newPath, response);

      return contentsModelForPath(newPath, true, fileTypeForPath);
    }
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
export async function copyFile(
  oldPath: string,
  newPath: string,
  fileTypeForPath: (path: string) => DocumentRegistry.IFileType
): Promise<Contents.IModel> {
  if (isDummy(PathExt.dirname(newPath))) {
    throw makeError(
      400,
      `Google Drive: "${newPath}"` + ' is not a valid save directory'
    );
  }
  if (oldPath === newPath) {
    throw makeError(
      400,
      'Google Drive: cannot copy a file with' +
        ' the same name to the same directory'
    );
  } else {
    let newFolderPath = PathExt.dirname(newPath);

    // Get a promise that resolves with the resource in the current position.
    const resourcePromise = getResourceForPath(oldPath);
    // Get a promise that resolves with the resource of the new folder.
    const newFolderPromise = getResourceForPath(newFolderPath);

    // Check the new path to make sure there isn't already a file
    // with the same name there.
    const newName = PathExt.basename(newPath);
    const directorySearchPromise = searchDirectory(
      newFolderPath,
      "name = '" + newName + "'"
    );

    // Once we have all the required information,
    // perform the copy.
    const values = await Promise.all([
      resourcePromise,
      newFolderPromise,
      directorySearchPromise
    ]);
    const resource = values[0];
    const newFolder = values[1];
    const directorySearch = values[2];

    if (directorySearch.length !== 0) {
      throw new Error(
        'Google Drive: File with the same name ' +
          'already exists in the destination directory'
      );
    } else {
      const createRequest = () => {
        return gapi.client.drive.files.copy({
          fileId: resource.id!,
          resource: {
            parents: [newFolder.id!],
            name: newName
          },
          fields: RESOURCE_FIELDS,
          supportsTeamDrives: !!(newFolder.teamDriveId || resource.teamDriveId)
        });
      };
      const response = await driveApiRequest<FileResource>(createRequest);
      // Update the cache.
      Private.resourceCache.set(newPath, response);
      return contentsModelForPath(newPath, true, fileTypeForPath);
    }
  }
}

/**
 * Invalidate the resource cache.
 *
 * #### Notes
 * The resource cache is mostly private to this module, and
 * is essential to not be rate-limited by Google.
 *
 * This should only be called when the user signs out, and
 * the cached information about their directory structure
 * is no longer valid.
 */
export function clearCache(): void {
  Private.resourceCache.clear();
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
export async function listRevisions(
  path: string
): Promise<Contents.ICheckpointModel[]> {
  const resource = await getResourceForPath(path);
  const getPage = (pageToken?: string) => {
    const createRequest = () => {
      return gapi.client.drive.revisions.list({
        fileId: resource.id!,
        pageSize: REVISION_PAGE_SIZE,
        pageToken,
        fields: `${REVISION_LIST_FIELDS}, revisions(${REVISION_FIELDS})`
      });
    };
    return driveApiRequest<gapi.client.drive.RevisionList>(createRequest);
  };
  const listing = await depaginate(getPage, 'revisions');
  const revisions = map(
    filter(listing || [], (revision: RevisionResource) => {
      return revision.keepForever!;
    }),
    (revision: RevisionResource) => {
      return { id: revision.id!, last_modified: revision.modifiedTime! };
    }
  );
  return toArray(revisions);
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
export async function pinCurrentRevision(
  path: string
): Promise<Contents.ICheckpointModel> {
  const resource = await getResourceForPath(path);
  const createRequest = () => {
    return gapi.client.drive.revisions.update({
      fileId: resource.id!,
      revisionId: resource.headRevisionId!,
      resource: {
        keepForever: true
      }
    });
  };
  const revision = await driveApiRequest<RevisionResource>(createRequest);
  return { id: revision.id!, last_modified: revision.modifiedTime! };
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
export async function unpinRevision(
  path: string,
  revisionId: string
): Promise<void> {
  const resource = await getResourceForPath(path);
  const createRequest = () => {
    return gapi.client.drive.revisions.update({
      fileId: resource.id!,
      revisionId: revisionId,
      resource: {
        keepForever: false
      }
    });
  };
  await driveApiRequest<RevisionResource>(createRequest);
  return;
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
export async function revertToRevision(
  path: string,
  revisionId: string,
  fileType: DocumentRegistry.IFileType
): Promise<void> {
  // Get the correct file resource.
  const revisionResource = await getResourceForPath(path);
  // Construct the request for a specific revision to the file.
  const createRequest = () => {
    return gapi.client.drive.revisions.get({
      fileId: revisionResource.id!,
      revisionId: revisionId,
      alt: 'media'
    });
  };
  // Make the request.
  const result = await driveApiRequest<any>(createRequest);
  let content: any = result;
  if (fileType.fileFormat === 'base64') {
    content = btoa(result);
  } else if (revisionResource.mimeType === 'application/json') {
    content = JSON.stringify(result, null, 2);
  }
  const contents: Contents.IModel = {
    name: revisionResource.name!,
    path: path,
    type: fileType.contentType,
    writable: revisionResource.capabilities!.canEdit || true,
    created: String(revisionResource.createdTime),
    // TODO What is the appropriate modified time?
    last_modified: String(revisionResource.modifiedTime),
    mimetype: fileType.mimeTypes[0],
    content,
    format: fileType.fileFormat
  };

  // Reupload the reverted file to the head revision.
  await uploadFile(path, contents, fileType, true, undefined);
  return;
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
function fileResourceFromContentsModel(
  contents: Partial<Contents.IModel>,
  fileType: DocumentRegistry.IFileType
): FileResource {
  let mimeType: string;
  switch (contents.type) {
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
    name: contents.name || PathExt.basename(contents.path || ''),
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
async function getResourceForRelativePath(
  pathComponent: string,
  folderId: string,
  teamDriveId: string = ''
): Promise<FileResource> {
  await gapiInitialized.promise;
  // Construct a search query for the file at hand.
  const query =
    `name = \'${pathComponent}\' and trashed = false ` +
    `and \'${folderId}\' in parents`;
  // Construct a request for the files matching the query.
  let createRequest: () => gapi.client.HttpRequest<gapi.client.drive.FileList>;
  if (teamDriveId) {
    createRequest = () => {
      return gapi.client.drive.files.list({
        q: query,
        pageSize: FILE_PAGE_SIZE,
        fields: `${FILE_LIST_FIELDS}, files(${RESOURCE_FIELDS})`,
        supportsTeamDrives: true,
        includeTeamDriveItems: true,
        corpora: 'teamDrive',
        teamDriveId: teamDriveId
      });
    };
  } else {
    createRequest = () => {
      return gapi.client.drive.files.list({
        q: query,
        pageSize: FILE_PAGE_SIZE,
        fields: `${FILE_LIST_FIELDS}, files(${RESOURCE_FIELDS})`
      });
    };
  }
  // Make the request.
  const result = await driveApiRequest<gapi.client.drive.FileList>(
    createRequest
  );
  const files: FileResource[] = result.files || [];
  if (!files || files.length === 0) {
    throw Error(
      'Google Drive: cannot find the specified file/folder: ' + pathComponent
    );
  } else if (files.length > 1) {
    throw Error('Google Drive: multiple files/folders match: ' + pathComponent);
  }
  return files[0];
}

/**
 * Given the unique id string for a file in Google Drive,
 * get the files resource metadata associated with it.
 *
 * @param id - The file ID.
 *
 * @returns A promise that resolves with the files resource
 *   corresponding to `id`.
 *
 * ### Notes
 * This does not support Team Drives.
 */
async function resourceFromFileId(id: string): Promise<FileResource> {
  await gapiInitialized.promise;
  const createRequest = () => {
    return gapi.client.drive.files.get({
      fileId: id,
      fields: RESOURCE_FIELDS
    });
  };
  return driveApiRequest<FileResource>(createRequest);
}

/**
 * Given a name, find the user's root drive resource,
 * or a Team Drive resource with the same name.
 *
 * @param name - The Team Drive name.
 */
async function driveForName(
  name: string
): Promise<TeamDriveResource | FileResource> {
  const rootResource = resourceFromFileId('root');
  const teamDriveResources = listTeamDrives();
  const result = await Promise.all([rootResource, teamDriveResources]);
  const root = result[0];
  const teamDrives = result[1];
  if (root.name === name) {
    return root;
  }
  for (let drive of teamDrives) {
    if (drive.name === name) {
      return drive;
    }
  }
  throw Error(`Google Drive: cannot find Team Drive: ${name}`);
}

/**
 * List the Team Drives accessible to a user.
 *
 * @returns a list of team drive resources.
 */
async function listTeamDrives(): Promise<TeamDriveResource[]> {
  await gapiAuthorized.promise;
  const getPage = (
    pageToken: string
  ): Promise<gapi.client.drive.TeamDriveList> => {
    const createRequest = () => {
      return gapi.client.drive.teamdrives.list({
        fields: `${TEAMDRIVE_LIST_FIELDS}, teamDrives(${TEAMDRIVE_FIELDS})`,
        pageSize: TEAMDRIVE_PAGE_SIZE,
        pageToken
      });
    };
    return driveApiRequest<gapi.client.drive.TeamDriveList>(createRequest);
  };
  return depaginate(getPage, 'teamDrives');
}

/**
 * Split a path into path components
 */
function splitPath(path: string): string[] {
  return path.split('/').filter((s, i, a) => Boolean(s));
}

/**
 * Whether a path is a dummy directory.
 */
export function isDummy(path: string): boolean {
  return path === COLLECTIONS_DIRECTORY || path === SHARED_DIRECTORY;
}

/**
 * Whether a resource is a directory (or Team Drive),
 * which may contain items.
 */
export function isDirectory(resource: FileResource): boolean {
  return !!(
    resource.kind === 'drive#teamDrive' || resource.mimeType === FOLDER_MIMETYPE
  );
}

/**
 * Depaginate a series of requests into a single array.
 */
async function depaginate<
  T extends FileResource | TeamDriveResource,
  L extends PaginatedResponse
>(
  getPage: (pageToken?: string) => Promise<L>,
  listName: keyof L,
  pageToken?: string
): Promise<T[]> {
  const list = await getPage(pageToken);
  const total = (list[listName] as any) as T[];
  if (list.nextPageToken) {
    return depaginate<T, L>(getPage, listName, list.nextPageToken).then(
      next => {
        return [...total, ...next];
      }
    );
  } else {
    return total;
  }
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
export async function getResourceForPath(path: string): Promise<FileResource> {
  // First check the cache.
  if (Private.resourceCache.has(path)) {
    return Private.resourceCache.get(path)!;
  }

  const components = splitPath(path);

  if (components.length === 0) {
    // Handle the case for the pseudo folders
    // (i.e., the view onto the "My Drive" and "Shared
    // with me" directories, as well as the pseudo-root).
    return COLLECTIONS_DIRECTORY_RESOURCE;
  } else if (components.length === 1 && components[0] === SHARED_DIRECTORY) {
    return SHARED_DIRECTORY_RESOURCE;
  } else {
    // Create a Promise of a FileResource to walk the path until
    // we find the right file.
    let currentResource: FileResource;

    // Current path component index.
    let idx = 0;

    // Team Drive id for the path, or the empty string if
    // the path is not in a Team Drive.
    let teamDriveId = '';

    if (components[0] === SHARED_DIRECTORY) {
      // Handle the case of the `Shared With Me` directory.
      const shared = await searchSharedFiles("name = '" + components[1] + "'");
      if (!shared || shared.length === 0) {
        throw Error(
          'Google Drive: cannot find the specified file/folder: ' +
            components[1]
        );
      } else if (shared.length > 1) {
        throw Error(
          'Google Drive: multiple files/folders match: ' + components[1]
        );
      }
      currentResource = shared[0];
      idx = 2; // Set the component index to the third component.
    } else {
      // Handle the case of a `My Drive` or a Team Drive
      try {
        const drive = await driveForName(components[0]);
        if (drive.kind === 'drive#teamDrive') {
          teamDriveId = drive.id!;
        }
        currentResource = drive;
        idx = 1;
      } catch {
        throw Error(`Unexpected file in root directory: ${components[0]}`);
      }
    }

    // Loop over the components, updating the current resource.
    // Start the loop at idx to skip the pseudo-root.
    for (; idx < components.length; idx++) {
      const component = components[idx];
      currentResource = await getResourceForRelativePath(
        component,
        currentResource.id!,
        teamDriveId
      );
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
async function downloadResource(
  resource: FileResource,
  picked: boolean = false
): Promise<any> {
  await gapiInitialized.promise;
  const token = gapi.auth.getToken().access_token;
  const url = `https://www.googleapis.com/drive/v3/files/${
    resource.id
  }?alt=media`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const data = await response.text();
  return data;
}

namespace Private {
  /**
   * A Map associating file paths with cached files
   * resources. This can significantly cut down on
   * API requests.
   */
  export const resourceCache = new Map<string, FileResource>();

  /**
   * When we list the contents of a directory we can
   * use that opportunity to refresh the cached values
   * for that directory. This function clears all
   * the cached resources that are in a given directory.
   */
  export function clearCacheForDirectory(path: string): void {
    resourceCache.forEach((value, key) => {
      let enclosingFolderPath = PathExt.dirname(key);
      if (path === enclosingFolderPath) {
        resourceCache.delete(key);
      }
    });
  }

  /**
   * Given a list of resources in a directory, put them in
   * the resource cache. This strips any duplicates, since
   * the path-based contents manager can't handle those correctly.
   */
  export function populateCacheForDirectory(
    path: string,
    resourceList: FileResource[]
  ) {
    // Identify duplicates in the list: we can't handle those
    // correctly, so don't insert them.
    const duplicatePaths: string[] = [];
    const candidatePaths: string[] = [];
    for (let resource of resourceList) {
      const filePath = PathExt.join(path, resource.name!);
      if (candidatePaths.indexOf(filePath) !== -1) {
        duplicatePaths.push(filePath);
      } else {
        candidatePaths.push(filePath);
      }
    }

    // Insert non-duplicates into the cache.
    for (let resource of resourceList) {
      const filePath = PathExt.join(path, resource.name!);
      if (duplicatePaths.indexOf(filePath) === -1) {
        Private.resourceCache.set(filePath, resource);
      }
    }
  }

  const encoder = new TextEncoder();
  /**
   * Encode a utf-8 string into base-64.
   *
   * See https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding#Solution_3_%E2%80%93_rewrite_the_DOMs_atob()_and_btoa()_using_JavaScript's_TypedArrays_and_UTF-8
   */
  export function b64EncodeUTF8(str: string) {
    const bytes = encoder.encode(str);
    return base64js.fromByteArray(bytes);
  }
}
