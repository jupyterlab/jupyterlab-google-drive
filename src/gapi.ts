// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

//TODO: Remove jquery dependency
import $ = require('jquery');

import {
  Contents, utils
} from '@jupyterlab/services';


import {
  showDialog
} from 'jupyterlab/lib/common/dialog';

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
//const SCOPE = [FILES_OAUTH_SCOPE, METADATA_OAUTH_SCOPE];

export
let gapiLoaded = new Promise<void>( (resolve, reject) => {
  //get the gapi script from Google
  $.getScript('https://apis.google.com/js/api.js')
  .done( (script, textStatus)=> {
    //load overall API
    (window as any).gapi.load('auth:client,drive-realtime,drive-share', ()=> {
      //load client library (for some reason different
      //from the toplevel API)
      gapi.client.load('drive', 'v3').then(()=>{
        console.log("gapi: loaded onto page");
        resolve();
      });
    });
  }).fail( () => {
    console.log("gapi: unable to load onto page");
    reject();
  });
});

export
let gapiAuthorized = new utils.PromiseDelegate<void>();

export
let driveReady = gapiAuthorized.promise;

export
function driveApiRequest( request: any, successCode: number = 200) : Promise<any> {
  return new Promise<any>((resolve, reject)=>{
    driveReady.then(()=>{
      request.then( (response: any)=> {
        if(response.status !== successCode) { //HTTP error
          console.log("gapi: Drive API error: ", response.status);
          console.log(response, request);
          reject(response.result);
        } else { //Success
          resolve(response.result);
        }
      }, (response: any)=>{ //Some other error
        console.log("gapi: Drive API Error.");
        console.log(response, request);
        reject(response);
      });
    });
  });
}

let authorizeRefresh: any = null;

export
function authorize (): Promise<void> {
  return gapiLoaded.then( () => {
    let handleAuthorization = function (authResult : any): void {
      if (authResult && !authResult.error) {
        console.log("gapi: authorized.");
        //Set a timer to refresh the authorization
        if(authorizeRefresh) clearTimeout(authorizeRefresh);
        authorizeRefresh = setTimeout( ()=>{
          console.log('gapi: refreshing authorization.')
          authorize();
        }, 750 * Number(authResult.expires_in));
        //resolve the exported promise
        gapiAuthorized.resolve();
        return void 0;
      } else {
        popupAuthorization();
      }
    }

    //Create a popup dialog asking the user
    //whether to proceed to authorization.
    //This prevents popup blockers from blocking
    //the Google OAuth screen.
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
          gapiAuthorized.reject();
          throw new Error("gapi: unable to authorize");
        }
      });
    }

    //Attempt to authorize without a popup
    gapi.auth.authorize({
      client_id: CLIENT_ID,
      scope: SCOPE,
      immediate: true}, handleAuthorization);
  });
}
