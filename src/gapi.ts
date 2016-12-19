// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import $ = require('jquery');

import {
  showDialog
} from 'jupyterlab/lib/dialog';

declare let gapi : any;

const CLIENT_ID = '625147942732-t30t8vnn43fl5mvg1qde5pl84603dr6s.apps.googleusercontent.com';

const FILES_OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const METADATA_OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.metadata';
const INSTALL_SCOPE = 'https://www.googleapis.com/auth/drive.install'
const RT_MIMETYPE = 'application/vnd.google-apps.drive-sdk';

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
function authorize () : Promise<void> {
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
              scope: [ FILES_OAUTH_SCOPE, METADATA_OAUTH_SCOPE],
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
        scope: [FILES_OAUTH_SCOPE, METADATA_OAUTH_SCOPE],
        immediate: true}, handleAuthorization);
    });
  });
}

export
function createPermissions (fileId: string, emailAddress: string ) : Promise<void> {
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
function createRealtimeDocument() : Promise<string> {
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
function loadRealtimeDocument( fileId : string) : Promise<gapi.drive.realtime.Document> {
  console.log("gapi : attempting to load realtime file " + fileId);
  return new Promise( (resolve, reject) => {
    gapi.drive.realtime.load( fileId, (doc : gapi.drive.realtime.Document ):any => {
      resolve(doc);
    });
  });
}
