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

/**
 * Default Client ID to let the Google Servers know who
 * we are. These can be changed to ones linked to a particular
 * user if they so desire.
 */
export
const DEFAULT_CLIENT_ID = '625147942732-t30t8vnn43fl5mvg1qde5pl84603dr6s.apps.googleusercontent.com';

/**
 * Scope for the permissions needed for this extension.
 */
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];

/**
 * Aliases for common API errors.
 */
const FORBIDDEN_ERROR = 403;
const RATE_LIMIT_REASON = 'rateLimitExceeded';

/**
 * A promise delegate that is resolved when the google client
 * libraries are loaded onto the page.
 */
export
let gapiLoaded = new PromiseDelegate<void>();

/**
 * A promise delegate that is resolved when the gapi client
 * libraries are initialized.
 */
export
let gapiInitialized = new PromiseDelegate<void>();

/**
 * A promise delegate that is resolved when the user authorizes
 * the app to access their Drive account.
 */
export
let gapiAuthorized = new PromiseDelegate<void>();

/**
 * Load the gapi scripts onto the page.
 *
 * @returns a promise that resolves when the gapi scripts are loaded.
 */
export
function loadGapi(): Promise<void> {
  return new Promise<void>( (resolve, reject) => {
    // Get the gapi script from Google.
    $.getScript('https://apis.google.com/js/api.js')
    .done((script, textStatus) => {
      // Load overall API.
      (window as any).gapi.load('client:auth2,drive-realtime,drive-share', () => {
        // Load the specific client libraries we need.
        console.log("gapi: loaded onto page");
        gapiLoaded.resolve(void 0);
        resolve(void 0);
      });
    }).fail( () => {
      console.log("gapi: unable to load onto page");
      gapiLoaded.reject(void 0);
      reject(void 0);
    });
  });
}

/**
 * Initialize the gapi client libraries.
 *
 * @param clientId: The client ID for the project from the
 *   Google Developer Console. If not given, defaults to
 *   a testing project client ID. However, if you are deploying
 *   your own Jupyter server, or are making heavy use of the
 *   API, it is probably a good idea to set up your own client ID.
 *
 * @returns a promise that resolves when the client libraries are loaded.
 *   The return value of the promise is a boolean indicating whether
 *   the user was automatically signed in by the initialization.
 */
export
function initializeGapi(clientId: string): Promise<boolean> {
  return new Promise<boolean>( (resolve, reject) => {
    gapiLoaded.promise.then(() => {
      gapi.client.init({
        discoveryDocs: DISCOVERY_DOCS,
        clientId: clientId || DEFAULT_CLIENT_ID,
        scope: DRIVE_SCOPE
      }).then(() => {
        // Check if the user is logged in and we are
        // authomatically authorized.
        let googleAuth = gapi.auth2.getAuthInstance();
        if (googleAuth.isSignedIn.get()) {
          refreshAuthToken().then(() => {
            gapiAuthorized.resolve(void 0);
          });
          gapiInitialized.resolve(void 0);
          resolve(true);
        } else {
          gapiInitialized.resolve(void 0);
          resolve(false);
        }
      }, (err: any) => {
        gapiInitialized.reject(void 0);
        reject(void 0);
      });
    });
  });
}

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
    gapiAuthorized.promise.then(() => {
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
function signIn(): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    gapiInitialized.promise.then(() => {
      let googleAuth = gapi.auth2.getAuthInstance();
      if (!googleAuth.isSignedIn.get()) {
        googleAuth.signIn().then((result: any) => {
          refreshAuthToken().then(() => {
            // Resolve the exported promise.
            gapiAuthorized.resolve(void 0);
            resolve(true);
          });
        });
      } else {
        // Otherwise we are already signed in.
        // Resolve the exported promise.
        gapiAuthorized.resolve(void 0);
        resolve(true);
      }
    });
  });
}

/**
 * Sign a user out of their Google account.
 *
 * @returns a promise resolved when sign-out is complete.
 */
export
function signOut(): Promise<void> {
  let googleAuth = gapi.auth2.getAuthInstance();
  // Invalidate the gapiAuthorized promise and set up a new one.
  gapiAuthorized = null;
  gapiAuthorized = new PromiseDelegate<void>();
  return googleAuth.signOut();
}

/**
 * Refresh the authorization token for Google APIs.
 *
 * #### Notes
 * Importantly, this calls `gapi.auth.setToken`.
 * Without this step, the realtime API will not pick
 * up the OAuth token, and it will not work. This step is
 * completely undocumented, but without it we cannot
 * use the newer, better documented, undeprecated `gapi.auth2`
 * authorization API.
 */
function refreshAuthToken(): Promise<void> {
  return new Promise<any>((resolve, reject) => {
    let googleAuth = gapi.auth2.getAuthInstance();
    let user = googleAuth.currentUser.get();
    user.reloadAuthResponse().then((authResponse: any) => {
      gapi.auth.setToken(authResponse);
      // Set a timer to refresh the authorization.
      if(authorizeRefresh) {
        clearTimeout(authorizeRefresh);
      }
      authorizeRefresh = setTimeout(() => {
        console.log('gapi: refreshing authorization.')
        refreshAuthToken();
      }, 750 * Number(authResponse.expires_in));
      resolve(void 0);
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
