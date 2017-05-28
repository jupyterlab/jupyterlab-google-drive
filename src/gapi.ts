// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

// TODO: Remove jquery dependency.
import $ = require('jquery');

import {
  PromiseDelegate
} from '@phosphor/coreutils';

import {
  ServerConnection
} from '@jupyterlab/services';

// TODO: Complete gapi typings and commit upstream.
declare let gapi: any;
declare let google: any;

/**
 * Client and App IDs to let the Google Servers know who
 * we are. These can be changed to ones linked to a particular
 * user if they so desire.
 */
const CLIENT_ID = '625147942732-t30t8vnn43fl5mvg1qde5pl84603dr6s.apps.googleusercontent.com';
const APP_ID = '625147942732';

/**
 * Scope for the permissions needed for this extension.
 */
const FILES_OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const METADATA_OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.metadata';
const SCOPE = [FILES_OAUTH_SCOPE, METADATA_OAUTH_SCOPE];

/**
 * Aliases for common API errors.
 */
const FORBIDDEN_ERROR = 403;
const RATE_LIMIT_REASON = 'rateLimitExceeded';

/**
 * A Promise that loads the gapi scripts onto the page,
 * and resolves when it is done.
 */
export
let gapiLoaded = new Promise<void>( (resolve, reject) => {
  //get the gapi script from Google
  $.getScript('https://apis.google.com/js/api.js')
  .done( (script, textStatus)=> {
    //load overall API
    (window as any).gapi.load('auth:client,drive-realtime,drive-share,picker', () => {
      //load client library (for some reason different
      //from the toplevel API)
      gapi.client.load('drive', 'v3').then(() => {
        console.log("gapi: loaded onto page");
        resolve();
      });
    });
  }).fail( () => {
    console.log("gapi: unable to load onto page");
    reject();
  });
});

/**
 * A promise that is resolved when the user authorizes
 * the app to access their Drive account.
 */
export
let gapiAuthorized = new PromiseDelegate<void>();

/**
 * A promise that resolves when Google Drive is ready.
 */
export
let driveReady = gapiAuthorized.promise;

/**
 * Constants used when attempting exponential backoff.
 */
const MAX_API_REQUESTS = 7;
const BACKOFF_FACTOR = 2.0;
const INITIAL_DELAY = 250; //250 ms

/**
 * Wrapper function for making API requests to Google Drive.
 *
 * @param request: a request object created by the Javascript client library.
 *
 * @param successCode: the code to check against for success of the request, defaults
 *   to 200.
 *
 * @param attemptNumber: the number of times this request has been made
 *   (used when attempting exponential backoff).
 *
 * @returns a promse that resolves with the result of the request.
 */
export
function driveApiRequest( request: any, successCode: number = 200, attemptNumber: number = 0): Promise<any> {
  if(attemptNumber === MAX_API_REQUESTS) {
    console.log(request);
    return Promise.reject(new Error('Maximum number of API retries reached.'));
  }
  return new Promise<any>((resolve, reject) => {
    driveReady.then(() => {
      request.then( (response: any)=> {
        if(response.status !== successCode) {
          // Handle an HTTP error.
          console.log("gapi: Drive API error: ", response.status);
          console.log(response, request);
          reject(makeError(response.result));
        } else {
          // For some reason, response.result is 
          // sometimes empty, but the required
          // result is in response.body. This is
          // not really documented anywhere I can
          // find, but this seems to fix it.
          if(response.result === false) {
            resolve(response.body);
          } else {
            resolve(response.result);
          }
        }
      }, (response: any) => {
        // Some other error happened. If we are being rate limited,
        // attempt exponential backoff. If that fails, bail.
        if(response.status === FORBIDDEN_ERROR &&
           response.result.error.errors[0].reason === RATE_LIMIT_REASON) {
          console.log("gapi: Throttling...");
          window.setTimeout( () => {
            // Try again after a delay.
            driveApiRequest(request, successCode, attemptNumber+1)
            .then((result: any) => {
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

/**
 * Timer for keeping track of refreshing the authorization with
 * Google drive.
 */
let authorizeRefresh: any = null;

/**
 * Ask the user for permission to use their Google Drive account.
 * First it tries to authorize without a popup, and if it fails, it
 * creates a popup. If the argument `allowPopup` is false, then it will
 * not try to authorize with a popup.
 *
 * @returns: a promise that resolves with a boolean for whether permission
 *   has been granted.
 */
export
function authorize(usePopup: boolean = false): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    gapiLoaded.then( () => {
      let handleAuthorization = function (authResult: any): void {
        if (authResult && !authResult.error) {
          console.log("gapi: authorized.");
          // Set a timer to refresh the authorization.
          if(authorizeRefresh) clearTimeout(authorizeRefresh);
          authorizeRefresh = setTimeout( () => {
            console.log('gapi: refreshing authorization.')
            authorize(false);
          }, 750 * Number(authResult.expires_in));
          // Resolve the exported promise.
          gapiAuthorized.resolve(void 0);
          resolve(true);
        } else {
          // Return with permissions not granted.
          resolve(false);
        }
      }

      // Attempt to authorize without a popup.
      gapi.auth.authorize({
        client_id: CLIENT_ID,
        scope: SCOPE,
        immediate: usePopup}, handleAuthorization);
    });
  });
}

/**
 * We do not automatically have permission to access files in a user's 
 * Google Drive which have not been created by this app. If such a file
 * is requested, we need to open a picker dialog to explicitly grant those
 * permissions.
 *
 * @param resource: the files resource that has been requested.
 * 
 * @returns a promise the resolves when the file has been picked.
 */
export
function pickFile(resource: any): Promise<void> {
  return new Promise<any>((resolve,reject) => {
    let pickerCallback = (response: any) => {
      // Resolve if the user has picked the selected file.
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
    driveReady.then(() => {
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

/**
 * Wrap an API error in a hacked-together error object
 * masquerading as an `IAJaxError`.
 */
export
function makeError(result: any): ServerConnection.IError {
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
  } as any as ServerConnection.IError;
}
