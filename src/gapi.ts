// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  PromiseDelegate
} from '@phosphor/coreutils';

import {
  ServerConnection
} from '@jupyterlab/services';

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
const BACKEND_ERROR = 500;
const RATE_LIMIT_REASON = 'rateLimitExceeded';

/**
 * A promise delegate that is resolved when the google client
 * libraries are loaded onto the page.
 */
export
const gapiLoaded = new PromiseDelegate<void>();

/**
 * A promise delegate that is resolved when the gapi client
 * libraries are initialized.
 */
export
const gapiInitialized = new PromiseDelegate<void>();

/**
 * A promise delegate that is resolved when the user authorizes
 * the app to access their Drive account.
 *
 * #### Notes
 * This promise will be reassigned if the user logs out.
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
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.type = 'text/javascript';
    gapiScript.async = true;

    // Load overall API scripts onto the page.
    gapiScript.onload = () => {
      // Load the specific client libraries we need.
      gapi.load('client:auth2,drive-realtime,drive-share', () => {
        gapiLoaded.resolve(void 0);
        resolve(void 0);
      });
    };
    gapiScript.onerror = () => {
      console.error("Unable to load Google APIs");
      gapiLoaded.reject(void 0);
      reject(void 0);
    };
    document.head.appendChild(gapiScript);
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
        const googleAuth = gapi.auth2.getAuthInstance();
        if (googleAuth.isSignedIn.get()) {
          Private.refreshAuthToken().then(() => {
            gapiAuthorized.resolve(void 0);
          });
          gapiInitialized.resolve(void 0);
          resolve(true);
        } else {
          gapiInitialized.resolve(void 0);
          resolve(false);
        }
      }, (err: any) => {
        gapiInitialized.reject(err);
        // A useful error message is in err.details.
        reject(err.details);
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
function driveApiRequest<T>( request: gapi.client.HttpRequest<T>, successCode: number = 200, attemptNumber: number = 0): Promise<T> {
  if(attemptNumber === MAX_API_REQUESTS) {
    console.log(request);
    return Promise.reject('Maximum number of API retries reached.');
  }
  return new Promise<T>((resolve, reject) => {
    gapiAuthorized.promise.then(() => {
      request.then((response) => {
        if(response.status !== successCode) {
          // Handle an HTTP error.
          let result: any = response.result;
          reject(makeError(result.error.code, result.error.message));
        } else {
          // If the response is note JSON-able, then `response.result`
          // will be `false`, and the raw data will be in `response.body`.
          // This happens, e.g., in the case of downloading raw image
          // data. This fix is a bit of a hack, but seems to work.
          if(response.result as any !== false) {
            resolve(response.result);
          } else {
            resolve(response.body as any);
          }
        }
      }, (response) => {
        // Some other error happened. If we are being rate limited,
        // attempt exponential backoff. If that fails, bail.
        if (response.status === BACKEND_ERROR ||
           (response.status === FORBIDDEN_ERROR &&
            (<any>response.result.error).errors[0].reason
             === RATE_LIMIT_REASON)) {
          console.warn(`gapi: ${response.status} error,` +
                       `attempting exponential backoff...`);
          window.setTimeout( () => {
            // Try again after a delay.
            driveApiRequest<T>(request, successCode, attemptNumber+1)
            .then((result) => {
              resolve(result);
            });
          }, INITIAL_DELAY*Math.pow(BACKOFF_FACTOR, attemptNumber));
        } else {
          let result: any = response.result;
          reject(makeError(result.error.code, result.error.message));
        }
      });
    });
  });
}

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
      const googleAuth = gapi.auth2.getAuthInstance();
      if (!googleAuth.isSignedIn.get()) {
        googleAuth.signIn({ prompt: 'select_account' }).then(() => {
          Private.refreshAuthToken().then(() => {
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
  const googleAuth = gapi.auth2.getAuthInstance();
  // Invalidate the gapiAuthorized promise and set up a new one.
  gapiAuthorized = new PromiseDelegate<void>();
  return googleAuth.signOut();
}

/**
 * Get the basic profile of the currently signed-in user.
 *
 * @returns a `gapi.auth2.BasicProfile instance.
 */
export
function getCurrentUserProfile(): gapi.auth2.BasicProfile {
  const user = gapi.auth2.getAuthInstance().currentUser.get();
  return user.getBasicProfile();
}

/**
 * Wrap an API error in a hacked-together error object
 * masquerading as an `ServerConnection.IError`.
 */
export
function makeError(code: number, message: string): ServerConnection.IError {
  const xhr = {
    status: code,
    responseText: message
  };
  return {
    event: undefined,
    xhr: xhr as XMLHttpRequest,
    ajaxSettings: null,
    throwError: xhr.responseText,
    message: xhr.responseText
  } as any as ServerConnection.IError;
}


/**
 * A namespace for private functions and values.
 */
namespace Private {
  /**
   * Timer for keeping track of refreshing the authorization with
   * Google drive.
   */
  let authorizeRefresh: any = null;

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
  export
  function refreshAuthToken(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const googleAuth = gapi.auth2.getAuthInstance();
      const user = googleAuth.currentUser.get();
      user.reloadAuthResponse().then((authResponse: any) => {
        gapi.auth.setToken(authResponse);
        // Set a timer to refresh the authorization.
        if(authorizeRefresh) {
          clearTimeout(authorizeRefresh);
        }
        authorizeRefresh = setTimeout(() => {
          console.log('gapi: refreshing authorization.')
          Private.refreshAuthToken();
        }, 750 * Number(authResponse.expires_in));
        resolve(void 0);
      });
    });
  }
}
