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

//TODO: Complete gapi typings and commit upstream
declare let gapi: any;

export
enum FileType {FILE=1, FOLDER=2};

const CLIENT_ID = '625147942732-t30t8vnn43fl5mvg1qde5pl84603dr6s.apps.googleusercontent.com';

const FULL_OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive';
const FILES_OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const METADATA_OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.metadata';
const INSTALL_SCOPE = 'https://www.googleapis.com/auth/drive.install'

const SCOPE = [FULL_OAUTH_SCOPE];
const RESOURCE_FIELDS='kind,id,name,mimeType,trashed,'+
                      'parents,modifiedTime,createdTime,capabilities';
//const SCOPE = [FILES_OAUTH_SCOPE, METADATA_OAUTH_SCOPE];

export
const RT_MIMETYPE = 'application/vnd.google-apps.drive-sdk';
export
const FOLDER_MIMETYPE = 'application/vnd.google-apps.folder';
export
const FILE_MIMETYPE = 'application/vnd.google-apps.file';

export
let gapiLoaded = new Promise<void>( (resolve, reject) => {
  $.getScript('https://apis.google.com/js/api.js')
  .done( (script, textStatus)=> {
    (window as any).gapi.load('auth:client,drive-realtime,drive-share', ()=> {
      console.log("gapi: loaded onto page");
      resolve();
    });
  }).fail( () => {
    console.log("gapi: unable to load onto page");
    reject();
  });
});



export
function authorize (): Promise<void> {
  return new Promise<void>( (resolve, reject) => {
    gapiLoaded.then( () => {
      let handleAuthorization = function (authResult : any) {
        if (authResult && !authResult.error) {
          resolve();
        } else {
          popupAuthorization();
        }
      }

      let popupAuthorization = function() {
        showDialog({
          title: 'Proceed to Google Authorization?',
          okText: 'OK'
        }).then( result => {
          if (result.text === 'OK') {
            gapi.auth.authorize({
              client_id: CLIENT_ID,
              scope: SCOPE,
              immediate: false
            }, handleAuthorization);
          } else {
            reject();
          }
        });
      }

      //Attempt to authorize without a popup
      gapi.auth.authorize({
        client_id: CLIENT_ID,
        scope: SCOPE,
        immediate: true}, handleAuthorization);
    });
  });
}

export
function createPermissions (fileId: string, emailAddress: string ): Promise<void> {
  return new Promise<void> ((resolve,reject) => {
    let permissionRequest = {
      'type' : 'user',
      'role' : 'writer',
      'emailAddress': emailAddress
    }
    gapi.client.load('drive', 'v3').then( () => {
      gapi.client.drive.permissions.create( {
        'fileId': fileId,
        'emailMessage' : fileId,
        'sendNotificationEmail' : true,
        'resource': permissionRequest
      }).then( (response : any) => {
        console.log("gapi: created permissions for "+emailAddress);
        resolve();
      });
    });
  });
}

export
function createRealtimeDocument(): Promise<string> {
  return new Promise( (resolve, reject) => {
    gapi.client.load('drive', 'v3').then( () => {
      gapi.client.drive.files.create({
        'resource': {
          mimeType: RT_MIMETYPE,
          name: 'jupyterlab_realtime_file'
          }
      }).then( (response : any) : void => {
        let fileId : string = response.result.id;
        console.log("gapi: created realtime document "+fileId);
        resolve(fileId);
      });
    });
  });
}

export
function loadRealtimeDocument( fileId : string): Promise<gapi.drive.realtime.Document> {
  console.log("gapi : attempting to load realtime file " + fileId);
  return new Promise( (resolve, reject) => {
    gapi.drive.realtime.load( fileId, (doc : gapi.drive.realtime.Document ):any => {
      resolve(doc);
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
    gapiLoaded.then(()=>{
      let query = 'name = \'' + pathComponent + '\' and trashed = false ';
      if (type === FileType.FOLDER) {
          query += ' and mimeType = \'' + FOLDER_MIMETYPE + '\'';
      }
      query += ' and \'' + folderId + '\' in parents';
      gapi.client.load('drive', 'v3').then(()=>{
        let request: string = gapi.client.drive.files.list({'q': query});
        return gapiExecute(request).then(function(response): any {
          let files: any = response['files'];
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
    });
  });
};

function fullResourceFromFileId(id: string): Promise<any> {
  return new Promise<any>((resolve,reject)=>{
    gapiLoaded.then(()=>{
      gapi.client.load('drive', 'v3').then(()=>{
        let request: any = gapi.client.drive.files.get({
         fileId: id,
         fields: RESOURCE_FIELDS
        });
        gapiExecute(request).then((response: any)=>{
          resolve(response);
        });
      });
    });
  });
}

function batchFullResourcesFromFileIds( ids: string[]): Promise<any[]> {
  console.log("Batch");
  return new Promise<any>((resolve,reject)=>{
    gapiLoaded.then(()=>{
      gapi.client.load('drive', 'v3').then(()=>{
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
        gapiExecute(batch).then((response: any)=>{
          let resources: any[] = []
          for(let i =0; i < ids.length; i++) {
            resources.push(response['resource'+String(i)].result);
          }
          resolve(resources);
        });
      });
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
    gapiLoaded.then(()=>{
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

/**
 * Executes a Google API request.  This wraps the request.execute() method,
 * by returning a Promise, which may be resolved or rejected.  The raw
 * return value of execute() has errors detected, and errors are wrapped as
 * an Error object.
 *
 * Typical usage:
 * var request = gapi.client.drive.files.get({
 *     'fileId': fileId
 * });
 * execute(request, success, error);
 *
 * @param {Object} request The request, generated by the Google JavaScript
 *     client API.
 * @return {Promise} Fullfilled with the result on success, or the
 *     result wrapped as an Error on error.
 */
export
function gapiExecute(request: any, attemptReauth:boolean = true): Promise<any> {
  return new Promise(function(resolve, reject) {
    request.execute( (result: any)=> {
      resolve(result);
    }, (result: any)=>{
      reject(result)
    });
  });
};

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
        gapi.client.load('drive', 'v3').then(()=>{
          let query: string = '\''+resource.id+'\' in parents';
          let request: string = gapi.client.drive.files.list({
            'q': query,
          });
          gapiExecute(request).then( (response: any)=>{
            let files: any = response.files;
            let ids: string[] = [];
            for(let i = 0; i<files.length; i++) {
              ids.push(files[i].id);
            }
            batchFullResourcesFromFileIds(ids).then((resources: any)=>{
              let currentFile = Promise.resolve({});
              for(let i = 0; i<resources.length; i++) {
                let fullResource = resources[i];
                currentFile = contentsModelFromFileResource(fullResource, path, false)
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
        });
      }
    } else {
      let contents: Contents.IModel = {
        name: resource.name,
        path: path,
        type: 'file',
        writable: resource.capabilities.canEdit,
        created: String(resource.createdTime),
        last_modified: String(resource.modifiedTime),
        mimetype: null,
        content: null,
        format: 'text'
      };
      resolve(contents);
    }
  });
}
