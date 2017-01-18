// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

//TODO: Remove jquery dependency
import $ = require('jquery');

import {
  map, filter, toArray
} from 'phosphor/lib/algorithm/iteration';

import {
  Contents, utils 
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
    let request: string = gapi.client.drive.files.list({
      q: query,
      fields: 'files('+RESOURCE_FIELDS+')'
    });
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
      resolve(files[0]);
    });
  });
}

function resourceFromFileId(id: string): Promise<any> {
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

/**
 * Split a path into path components
 */
function splitPath(path: string): string[] {
    return path.split('/').filter((s,i,a) => (Boolean(s)));
};

export
function urlForFile(path: string): Promise<string> {
  return new Promise<string>((resolve, reject)=>{
    getResourceForPath(path).then((resource: any)=>{
      resolve(resource.webContentLink);
    });
  });
}



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
      resourceFromFileId('root').then((resource:any)=>{
        resolve(resource);
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

export
function fileResourceFromContentsModel(contents: Contents.IModel): any {
  let mimeType = '';
  switch (contents.type) {
    case 'directory':
      mimeType = FOLDER_MIMETYPE;
      break;
    case 'notebook':
      mimeType = 'application/ipynb';
      break;
    case 'file':
      mimeType = FILE_MIMETYPE;
      break;
    default:
      throw new Error('Invalid contents type');
  }
  return {
    name: contents.name,
    mimeType: mimeType
  };
}

export
function uploadFile(path: string, model: Contents.IModel, existing: boolean = false): Promise<Contents.IModel> {
  return new Promise<Contents.IModel>((resolve,reject)=>{
    let resourceReadyPromise = Promise.resolve(void 0);
    if(existing) {
      resourceReadyPromise = getResourceForPath(path)
    } else {
      resourceReadyPromise = new Promise<any>((resolve,reject)=>{
        let enclosingFolderPath =
          utils.urlPathJoin(...splitPath(path).slice(0,-1));
        let resource: any = fileResourceFromContentsModel(model);
        getResourceForPath(enclosingFolderPath)
        .then((parentFolderResource: any)=>{
          if(parentFolderResource.mimeType !== FOLDER_MIMETYPE) {
             throw new Error("Google Drive: expected a folder: "+path);
          }
          resource['parents'] = [parentFolderResource.id];
          resolve(resource);
        });
      });
    }
    resourceReadyPromise.then((resource: any)=>{
      //Construct the HTTP request: first the metadata,
      //then the content of the uploaded file

      let delimiter = '\r\n--' + MULTIPART_BOUNDARY + '\r\n';
      let closeDelim = '\r\n--' + MULTIPART_BOUNDARY + '--';
      let mime = resource.mimeType;
      switch(model.type) {
        case 'notebook':
          mime = 'application/json';
          break;
        case 'directory':
          mime = FOLDER_MIMETYPE;
          break;
      }

      //Metatdata part
      let body = delimiter+'Content-Type: application/json\r\n\r\n';
      //Don't update metadata if the file already exists.
      if(!existing) {
        body += JSON.stringify(resource);
      }
      body += delimiter;

      //Content of the file
      body += 'Content-Type: ' + mime + '\r\n';
      if (mime === 'application/octet-stream') {
        body += 'Content-Transfer-Encoding: base64\r\n';
      }
      //TODO: this puts extra quotes around strings.
      body +='\r\n' + JSON.stringify(model.content) + closeDelim;

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

      driveApiRequest(request).then( (result: any)=>{
        console.log("gapi: uploaded document to "+result.id);
        contentsModelFromFileResource(result, path, true).then((contents: Contents.IModel)=>{
          resolve(contents);
        });
      });
    });
  });
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
        searchDirectory(path).then( (resources: any[])=>{
          let currentContents = Promise.resolve({});

          for(let i = 0; i<resources.length; i++) {
            let currentResource = resources[i];
            let resourcePath = path ?
                               path+'/'+currentResource.name :
                               currentResource.name;
            currentContents = contentsModelFromFileResource(
              currentResource, resourcePath, false);
            currentContents.then((contents: Contents.IModel)=>{
              fileList.push(contents);
            });
          }
          currentContents.then(()=>{
            contents.content = fileList;
            resolve(contents);
          });
        });
      } else {
        resolve(contents);
      }
    } else {
      let contentType = resource.mimeType === 'application/ipynb' ?
                        'notebook' : 'file';
      let contents: any = {
        name: resource.name,
        path: path,
        type: contentType,
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
          console.log("Google Drive: unable to download contents");
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

export
function searchDirectory(path: string, query: string = ''): Promise<any[]> {
  return new Promise<any[]>((resolve, reject)=>{
    getResourceForPath(path, FileType.FOLDER).then((resource: any)=>{
      let fullQuery: string = '\''+resource.id+'\' in parents '+
                              'and trashed = false';
      if(query) fullQuery += ' and '+query;
      let request = gapi.client.drive.files.list({
        q: fullQuery,
        fields: 'files('+RESOURCE_FIELDS+')'
      });
      driveApiRequest(request).then((result: any)=>{
        resolve(result.files);
      });
    });
  });
}

export
function deleteFile(path: string): Promise<void> {
  return new Promise<void>((resolve, reject)=>{
    getResourceForPath(path).then((resource: any)=>{
      let request: any = gapi.client.drive.files.delete({fileId: resource.id});
      driveApiRequest(request, 204).then(()=>{
        resolve();
      });
    }).catch((result)=>{
      console.log('Google Drive: unable to delete file: '+path);
      reject();
    });
  });
}

export
function listRevisions(path: string): Promise<Contents.ICheckpointModel[]> {
  return new Promise<Contents.ICheckpointModel[]>((resolve, reject)=>{
    getResourceForPath(path).then((resource: any)=>{
      let request: any = gapi.client.drive.revisions.list({
        fileId: resource.id,
        fields: 'revisions(id, modifiedTime, keepForever)' //NOT DOCUMENTED
      });
      driveApiRequest(request).then((result: any)=>{
        let revisions = map(filter(result.revisions, (revision: any)=>{
          return revision.keepForever;
        }), (revision: any)=>{
          return { id: revision.id, last_modified: revision.modifiedTime }
        });
        resolve(toArray(revisions));
      });
    });
  });
}


export
function pinCurrentRevision(path: string): Promise<Contents.ICheckpointModel> {
  return new Promise<Contents.ICheckpointModel>((resolve, reject)=>{
    getResourceForPath(path).then((resource: any)=>{
      let request: any = gapi.client.drive.revisions.update({
        fileId: resource.id,
        revisionId: resource.headRevisionId,
        keepForever: true
      });
      driveApiRequest(request).then((revision: any)=>{
        resolve ({ id: revision.id, last_modified: revision.modifiedTime });
      });
    });
  });
}

export
function unpinRevision(path: string, revisionId: string): Promise<void> {
  return new Promise<void>((resolve, reject)=>{
    getResourceForPath(path).then((resource: any)=>{
      let request: any = gapi.client.drive.revisions.update({
        fileId: resource.id,
        revisionId: revisionId,
        keepForever: false
      });
      driveApiRequest(request).then(()=>{
        resolve ();
      });
    });
  });
}

export
function contentsModelForPath(path: string, includeContents: boolean = false): Promise<Contents.IModel> {
  return new Promise<Contents.IModel>((resolve,reject)=>{
    getResourceForPath(path).then((resource: any)=>{
      contentsModelFromFileResource(resource, path, includeContents)
      .then((contents: Contents.IModel)=>{
        resolve(contents);
      });
    });
  });
}


export
function moveFile(oldPath: string, newPath: string): Promise<Contents.IModel> {
  if( oldPath === newPath ) {
    return contentsModelForPath(oldPath);
  } else {
    return new Promise<Contents.IModel>((resolve, reject)=>{
      let pathComponents = splitPath(newPath);
      let newFolderPath = utils.urlPathJoin(...pathComponents.slice(0,-1));

      //Get a promise that resolves with the resource in the current position.
      let resourcePromise = getResourceForPath(oldPath)
      //Get a promise that resolves with the resource of the new folder.
      let newFolderPromise = getResourceForPath(newFolderPath);

      //Check the new path to make sure there isn't already a file
      //with the same name there.
      let newName = pathComponents.slice(-1)[0];
      let directorySearchPromise =
        searchDirectory(newFolderPath, 'name = \''+newName+'\'');

      Promise.all([resourcePromise, newFolderPromise, directorySearchPromise])
      .then((values)=>{
        let resource = values[0];
        let newFolder = values[1];
        let directorySearch = values[2];

        if(directorySearch.length !== 0) {
            reject(void 0);
        } else {
          let request: any = gapi.client.drive.files.update({
            fileId: resource.id,
            addParents: newFolder.id,
            removeParents: resource.parents[0],
            name: newName
          });
          driveApiRequest(request).then(()=>{
            contentsModelForPath(newPath)
            .then((contents: Contents.IModel)=>{
              resolve(contents);
            });
          });
        }
      });
    });
  }
}

export
function revertToRevision(path: string, revisionId: string): Promise<void> {
  return new Promise<void>((resolve, reject)=>{
    getResourceForPath(path).then((resource: any)=>{
      let downloadRequest: any = gapi.client.drive.revisions.get({
       fileId: resource.id,
       revisionId: revisionId,
       alt: 'media'
      });
      driveApiRequest(downloadRequest).then((result: any)=>{
        //Reconstruct the ContentsModel.
        let contentType: Contents.ContentType =
          resource.mimeType === 'application/ipynb' ?
          'notebook' : 'file';
        let contents: Contents.IModel = {
          name: resource.name,
          path: path,
          type: contentType,
          writable: resource.capabilities.canEdit,
          created: String(resource.createdTime),
          //TODO What is the appropriate modified time?
          last_modified: String(resource.modifiedTime),
          mimetype: null,
          content: result,
          format: 'json'
        };

        uploadFile(path, contents, true).then((reverted: Contents.IModel)=>{
          resolve();
        });
      });
    });
  });
}
