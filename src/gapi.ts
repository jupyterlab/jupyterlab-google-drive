// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

//TODO: Remove jquery dependency
import $ = require('jquery');

import {
  PromiseDelegate
} from '@phosphor/coreutils';

import {
  utils
} from '@jupyterlab/services';


import {
  Dialog, showDialog
} from '@jupyterlab/apputils';

//TODO: Complete gapi typings and commit upstream
declare let gapi: any;
declare let google: any;

const CLIENT_ID = '625147942732-t30t8vnn43fl5mvg1qde5pl84603dr6s.apps.googleusercontent.com';
const APP_ID = '625147942732';

const FILES_OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const METADATA_OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.metadata';

const SCOPE = [FILES_OAUTH_SCOPE, METADATA_OAUTH_SCOPE];

const FORBIDDEN_ERROR = 403;
const RATE_LIMIT_REASON = 'rateLimitExceeded';

export
let gapiLoaded = new Promise<void>( (resolve, reject) => {
  //get the gapi script from Google
  $.getScript('https://apis.google.com/js/api.js')
  .done( (script, textStatus)=> {
    //load overall API
    (window as any).gapi.load('auth:client,drive-realtime,drive-share,picker', ()=> {
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
let gapiAuthorized = new PromiseDelegate<void>();

export
let driveReady = gapiAuthorized.promise;

const MAX_API_REQUESTS = 7;
const BACKOFF_FACTOR = 2.0;
const INITIAL_DELAY = 250; //250 ms

export
function driveApiRequest( request: any, successCode: number = 200, attemptNumber: number = 0): Promise<any> {
  if(attemptNumber === MAX_API_REQUESTS) {
    console.log(request);
    return Promise.reject(new Error('Maximum number of API retries reached.'));
  }
  return new Promise<any>((resolve, reject)=>{
    driveReady.then(()=>{
      request.then( (response: any)=> {
        if(response.status !== successCode) { //HTTP error
          console.log("gapi: Drive API error: ", response.status);
          console.log(response, request);
          reject(makeError(response.result));
        } else { //Success
          //For some reason, response.result is 
          //sometimes empty, but the required
          //result is in response.body. This is
          //not really documented anywhere I can
          //find, but this seems to fix it.
          if(response.result === false) {
            resolve(response.body);
          } else {
            resolve(response.result);
          }
        }
      }, (response: any)=>{ //Some other error
        if(response.status === FORBIDDEN_ERROR &&
           response.result.error.errors[0].reason === RATE_LIMIT_REASON) {
          console.log("gapi: Throttling...");
          window.setTimeout( ()=>{
            //Try again after a delay.
            driveApiRequest(request, successCode, attemptNumber+1)
            .then((result: any)=>{
              resolve(result);
            });
          }, INITIAL_DELAY*Math.pow(BACKOFF_FACTOR, attemptNumber));
        } else {
          console.log(response, request);
          reject(makeError(response.result));
        }
      });
    });
  });
}

let authorizeRefresh: any = null;

export
function authorize (): Promise<void> {
  return gapiLoaded.then( () => {
    let handleAuthorization = function (authResult: any): void {
      if (authResult && !authResult.error) {
        console.log("gapi: authorized.");
        //Set a timer to refresh the authorization
        if(authorizeRefresh) clearTimeout(authorizeRefresh);
        authorizeRefresh = setTimeout( ()=>{
          console.log('gapi: refreshing authorization.')
          authorize();
        }, 750 * Number(authResult.expires_in));
        //resolve the exported promise
        gapiAuthorized.resolve(void 0);
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
        buttons: [Dialog.cancelButton(), Dialog.okButton({label: 'OK'})]
      }).then( result => {
        if (result.accept) {
          gapi.auth.authorize({
            client_id: CLIENT_ID,
            scope: SCOPE,
            immediate: false
          }, handleAuthorization);
        } else {
          gapiAuthorized.reject(void 0);
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

export
function pickFile(resource: any): Promise<any> {
  return new Promise<any>((resolve,reject)=>{
    let pickerCallback = (response: any)=> {
      //Resolve if the user has picked the selected file.
      if(response[google.picker.Response.ACTION] ===
         google.picker.Action.PICKED &&
         response[google.picker.Response.DOCUMENTS][0][google.picker.Document.ID] ===
         resource.id) {
        resolve(void 0);
      } else if(response[google.picker.Response.ACTION] ===
         google.picker.Action.PICKED &&
         response[google.picker.Response.DOCUMENTS][0][google.picker.Document.ID] !==
         resource.id) {
        reject(new Error('Wrong file selected for permissions'));
      } else if(response[google.picker.Response.ACTION] ===
         google.picker.Action.CANCEL) {
        reject(new Error('Insufficient permisson to open file'));
      }
    }
    driveReady.then(()=>{
      let pickerView = new google.picker.DocsView(google.picker.ViewId.DOCS)
          .setMode(google.picker.DocsViewMode.LIST)
          .setParent(resource.parents[0])
          .setQuery(resource.name);

      let picker = new google.picker.PickerBuilder()
        .addView(pickerView)
        .enableFeature(google.picker.Feature.NAV_HIDDEN)
        .setAppId(APP_ID)
        .setOAuthToken(gapi.auth.getToken()['access_token'])
        .setTitle('Select to authorize opening this file with JupyterLab...')
        .setCallback(pickerCallback)
        .build();
      picker.setVisible(true);
    });
  });
}

export
function makeError(result: any): utils.IAjaxError {
  let xhr = {
    status: result.error.code,
    responseText: result.error.message
  };
  return {
    event: undefined,
    xhr: xhr as XMLHttpRequest,
    ajaxSettings: null,
    throwError: xhr.responseText,
    message: xhr.responseText
  } as utils.IAjaxError;
}
