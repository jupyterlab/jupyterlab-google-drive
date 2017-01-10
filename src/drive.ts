// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

//TODO: Remove jquery dependency
import $ = require('jquery');

import {
  Contents
} from '@jupyterlab/services';

import {
  showDialog
} from 'jupyterlab/lib/dialog';

import {
  driveApiRequest, driveReady
} from './gapi';

//TODO: Complete gapi typings and commit upstream
declare let gapi: any;

export
enum FileType {FILE=1, FOLDER=2};

const RESOURCE_FIELDS='kind,id,name,mimeType,trashed,'+
                      'parents,modifiedTime,createdTime,capabilities';

export
const RT_MIMETYPE = 'application/vnd.google-apps.drive-sdk';
export
const FOLDER_MIMETYPE = 'application/vnd.google-apps.folder';
export
const FILE_MIMETYPE = 'application/vnd.google-apps.file';

export
function createPermissions (fileId: string, emailAddress: string ): Promise<void> {
  return new Promise<void> ((resolve,reject) => {
    let permissionRequest = {
      'type' : 'user',
      'role' : 'writer',
      'emailAddress': emailAddress
    }
    let request = gapi.client.drive.permissions.create({
      'fileId': fileId,
      'emailMessage' : fileId,
      'sendNotificationEmail' : true,
      'resource': permissionRequest
    });
    driveApiRequest(request).then( (result : any) => {
      console.log("gapi: created permissions for "+emailAddress);
      resolve();
    });
  });
}

export
function createRealtimeDocument(): Promise<string> {
  return new Promise( (resolve, reject) => {
    let request = gapi.client.drive.files.create({
        'resource': {
          mimeType: RT_MIMETYPE,
          name: 'jupyterlab_realtime_file'
          }
    })
    driveApiRequest(request).then( (result : any)=>{
      let fileId : string = result.id;
      console.log("gapi: created realtime document "+fileId);
      resolve(fileId);
    });
  });
}

export
function loadRealtimeDocument( fileId : string): Promise<gapi.drive.realtime.Document> {
  return new Promise((resolve, reject) =>{
    driveReady.then(()=>{
      console.log("gapi : attempting to load realtime file " + fileId);
      gapi.drive.realtime.load( fileId, (doc : gapi.drive.realtime.Document ):any => {
        resolve(doc);
      });
    });
  });
}

/**
 * Obtains the Google Drive Files resource for a file or folder relative
 * to the a given folder.  The path should be a file or a subfolder, and
 * should not contain multiple levels of folders (hence the name
 * path_component).  It should also not contain any leading or trailing
 * slashes.
 *
 * @param {string} pathComponent: The file/folder to find
 * @param {FileType} type: type of resource (file or folder)
 * @param {boolean} opt_child:_resource If True, fetches a child resource
 *     which is smaller and probably quicker to obtain the a Files resource.
 * @param {string} folder_id: The Google Drive folder id
 * @return A promise fullfilled by either the files resource for the given
 *     file/folder, or rejected with an Error object.
 */
function getResourceForRelativePath(pathComponent: string, type: FileType, folderId: string): Promise<any> {
  return new Promise<any>((resolve,reject)=>{
    let query = 'name = \'' + pathComponent + '\' and trashed = false ';
    if (type === FileType.FOLDER) {
        query += ' and mimeType = \'' + FOLDER_MIMETYPE + '\'';
    }
    query += ' and \'' + folderId + '\' in parents';
    let request: string = gapi.client.drive.files.list({'q': query});
    return driveApiRequest(request).then((result: any)=>{
      let files: any = result.files;
      if (!files || files.length === 0) {
        throw new Error(
          "Google Drive: cannot find the specified file/folder: "
          +pathComponent);
      } else if (files.length > 1) {
        throw new Error(
          "Google Drive: multiple files/folders match: "
          +pathComponent);
      }
      //Unfortunately, files resource returned by `drive.files.list`
      //does not allow for specifying the fields that we want, so
      //we have to query the server again for those.
      fullResourceFromFileId( files[0].id ).then( (resource: any)=> {
        resolve(resource);
      });
    });
  });
}

function fullResourceFromFileId(id: string): Promise<any> {
  return new Promise<any>((resolve,reject)=>{
    let request: any = gapi.client.drive.files.get({
     fileId: id,
     fields: RESOURCE_FIELDS
    });
    driveApiRequest(request).then((result: any)=>{
        resolve(result);
    });
  });
}

function batchFullResourcesFromFileIds( ids: string[]): Promise<any[]> {
  console.log("Batch");
  return new Promise<any>((resolve,reject)=>{
    let batch = gapi.client.newBatch();
    let resourceRequest = function(id: string): any {
      return gapi.client.drive.files.get({
       fileId: id,
       fields: RESOURCE_FIELDS
      });
    }
    for(let i =0; i < ids.length; i++) {
      batch.add( resourceRequest(ids[i]), {'id': 'resource'+String(i)});
    }
    driveApiRequest(batch).then((result: any)=>{
      let resources: any[] = []
      for(let i =0; i < ids.length; i++) {
        resources.push(result['resource'+String(i)].result);
      }
      resolve(resources);
    });
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
 * @param {String} path The path
 * @param {FileType} type The type (file or folder)
 * @return {Promise} fullfilled with file/folder id (string) on success
 *     or Error object on error.
 */
export
function getResourceForPath(path: string, type?: FileType): Promise<any> {
  return new Promise<any>((resolve,reject)=>{
    let components = splitPath(path);

    if (components.length === 0) {
      //Handle the case for the root folder
      fullResourceFromFileId('root').then((fullResource:any)=>{
        resolve(fullResource);
      });
    } else {
      //Loop through the path components and get the resource for each
      //one, verifying that the path corresponds to a valid drive object.

      //Utility function that gets the file resource object given its name,
      //whether it is a file or a folder, and a promise for the resource 
      //object of its containing folder.
      let getResource = function(pathComponent: string, componentType: FileType, parentResource: Promise<any>): Promise<any> {
        return parentResource.then((resource: any)=>{
          return getResourceForRelativePath(pathComponent, componentType, resource['id']);
        });
      }

      //We start with the root directory:
      let currentResource: Promise<any> = Promise.resolve({id: 'root'});

      //Loop over the components, updating the current resource
      for (let i = 0; i < components.length; i++) {
        let component = components[i];
        let ctype = (i == components.length - 1) ? type : FileType.FOLDER;
        currentResource = getResource(component, ctype, currentResource);
      }

      //Resolve with the final value of currentResource.
      currentResource.then( (resource: any)=>{resolve(resource);});
    }
  });
}


/**
* Gets the Google Drive file/folder ID for a file or folder.  The path is
* always treated as an absolute path, no matter whether it contains leading
* or trailing slashes.  In fact, all leading, trailing and consecutive
* slashes are ignored.
 *
 * @param {String} path The path
 * @param {FileType} type The type (file or folder)
 * @return {Promise} fullfilled with folder id (string) on success
 *     or Error object on error.
 */
function getIdForPath(path: string, type?: FileType) {
  var components = splitPath(path);
  if (components.length == 0) {
    return $.Deferred().resolve('root');
  }
  return getResourceForPath(path, type)
    .then(function(resource): string { return resource['id']; });
}

export
function contentsModelFromFileResource(resource: any, path: string, includeContents: boolean = false): Promise<Contents.IModel> {
  return new Promise<Contents.IModel>((resolve,reject)=>{
    if(resource.mimeType === FOLDER_MIMETYPE) {
      //enter contents metadata
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

      //get directory listing if applicable
      let fileList: any[] = [];
      if (includeContents) {
        let query: string = '\''+resource.id+'\' in parents';
        let request: string = gapi.client.drive.files.list({
          'q': query,
        });
        driveApiRequest(request).then( (result: any)=>{
          let files: any = result.files;
          let ids: string[] = [];
          for(let i = 0; i<files.length; i++) {
            ids.push(files[i].id);
          }
          batchFullResourcesFromFileIds(ids).then((resources: any)=>{
            let currentFile = Promise.resolve({});
            for(let i = 0; i<resources.length; i++) {
              let fullResource = resources[i];
              let resourcePath = path ?
                                 path+'/'+fullResource.name :
                                 fullResource.name;
              currentFile = contentsModelFromFileResource(
                fullResource, resourcePath, false);
              currentFile.then((contents: Contents.IModel)=>{
                fileList.push(contents);
              });
            }
            currentFile.then(()=>{
              contents.content = fileList;
              resolve(contents);
            });
          });
        });
      } else {
        resolve(contents);
      }
    } else {
      let contents: any = {
        name: resource.name,
        path: path,
        type: 'file',
        writable: resource.capabilities.canEdit,
        created: String(resource.createdTime),
        last_modified: String(resource.modifiedTime),
        mimetype: null,
        content: null,
        format: 'json'
      };
      if(includeContents ) {
        downloadResource(resource).then((result: any)=>{
          contents.content = result;
          resolve(contents);
        }).catch(()=>{
          debugger;
        });
      } else {
        resolve(contents);
      }
    }
  });
}

function downloadResource(resource: any): Promise<any> {
  return new Promise<any>((resolve,reject)=>{
    let request: any = gapi.client.drive.files.get({
     fileId: resource.id,
     alt: 'media'
    });
    driveApiRequest(request).then((result: any)=>{
      resolve(result);
    });
  });
}
