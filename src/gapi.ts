// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  PromiseDelegate
} from '@phosphor/coreutils';

import {
  ServerConnection
} from '@jupyterlab/services';

import {
  clearCache
} from './drive/drive';

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
const INVALID_CREDENTIALS_ERROR = 401;
const FORBIDDEN_ERROR = 403;
const BACKEND_ERROR = 500;
const RATE_LIMIT_REASON = 'userRateLimitExceeded';

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
 * A boolean that is set if the deprecated realtime APIs
 * have been loaded onto the page.
 */
export
let realtimeLoaded = false;

/**
 * Load the gapi scripts onto the page.
 *
 * @param realtime - whether to load the (deprecated) realtime libraries.
 *
 * @returns a promise that resolves when the gapi scripts are loaded.
 */
export
function loadGapi(realtime: boolean): Promise<void> {
  return new Promise<void>( (resolve, reject) => {
    // Get the gapi script from Google.
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.type = 'text/javascript';
    gapiScript.async = true;

    // Load overall API scripts onto the page.
    gapiScript.onload = () => {
      // Load the specific client libraries we need.
      const libs = realtime ?
                   'client:auth2,drive-realtime,drive-share' :
                   'client:auth2';
      gapi.load(libs, () => {
        if (realtime) { realtimeLoaded = true };
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
          // Manually set the auth token so that the realtime
          // API can pick it up, then listen for changes to the auth.
          Private.setAuthToken();
          googleAuth.currentUser.listen(Private.onAuthRefreshed);
          // Resolve the relevant promises.
          gapiAuthorized.resolve(void 0);
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
 * @param createRequest: a function that creates a request object for
 *   the Google Drive APIs. This is typically created by the Javascript
 *   client library. We use a request factory to create additional requests
 *   should we need to try exponential backoff.
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
function driveApiRequest<T>( createRequest: () => gapi.client.HttpRequest<T>, successCode: number = 200, attemptNumber: number = 0): Promise<T> {
  if(attemptNumber === MAX_API_REQUESTS) {
    return Promise.reject('Maximum number of API retries reached.');
  }
  return new Promise<T>((resolve, reject) => {
    gapiAuthorized.promise.then(() => {
      const request = createRequest();
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
        // Some error happened.
        if (response.status === BACKEND_ERROR ||
           (response.status === FORBIDDEN_ERROR &&
            (<any>response.result.error).errors[0].reason
             === RATE_LIMIT_REASON)) {
          // If we are being rate limited, or if there is a backend error,
          // attempt exponential backoff.
          console.warn(`gapi: ${response.status} error, exponential ` +
                       `backoff attempt number ${attemptNumber}...`);
          window.setTimeout( () => {
            // Try again after a delay.
            driveApiRequest<T>(createRequest, successCode, attemptNumber+1)
            .then((result) => {
              resolve(result);
            });
          }, INITIAL_DELAY*Math.pow(BACKOFF_FACTOR, attemptNumber));
        } else if (response.status === INVALID_CREDENTIALS_ERROR) {
          // If we have invalid credentials, try to refresh
          // the authorization, then retry the request.
          Private.refreshAuthToken().then(() => {
            driveApiRequest<T>(createRequest, successCode, attemptNumber+1)
            .then((result) => {
              resolve(result);
            }).catch(err => {
              let result: any = response.result;
              reject(makeError(result.error.code, result.error.message));
            });
          });
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
          // Manually set the auth token so that the realtime
          // API can pick it up, then listen for refreshes.
          Private.setAuthToken();
          googleAuth.currentUser.listen(Private.onAuthRefreshed);
          // Resolve the exported promise.
          gapiAuthorized.resolve(void 0);
          resolve(true);
        });
      } else {
        // Otherwise we are already signed in.
        // Manually set the auth token so that the realtime
        // API can pick it up, then listen for refreshes.
        Private.setAuthToken();
        googleAuth.currentUser.listen(Private.onAuthRefreshed);
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
  return googleAuth.signOut().then(() => { clearCache(); });
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
 * Handle an error thrown by a realtime file,
 * if possible.
 *
 * @param err - the realtime error.
 */
export
function handleRealtimeError(err: gapi.drive.realtime.Error): void {
  if (err.type === gapi.drive.realtime.ErrorType.TOKEN_REFRESH_REQUIRED) {
    // gapi.auth2 automatically refreshes the token,
    // but due to a bug in the drive realtime client,
    // this is not automatically picked up by the
    // realtime system. If we get a TOKEN_REFRESH_REQUIRED,
    // it may be enough to manually set the token that
    // has already been refreshed.
    Private.refreshAuthToken();
  } else if (err.isFatal === false) {
    // If we can recover, do nothing.
    return void 0;
  } else {
   throw err;
  }
}


/**
 * A namespace for private functions and values.
 */
namespace Private {
  /**
   * Set authorization token for Google APIs.
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
  function setAuthToken(): void {
    const googleAuth = gapi.auth2.getAuthInstance();
    const user = googleAuth.currentUser.get();
    const authResponse = user.getAuthResponse();
    gapi.auth.setToken({
      access_token: authResponse.access_token,
      expires_in: String(authResponse.expires_in),
      error: '',
      state: authResponse.scope
    });
  }

  /**
   * Try to manually refresh the authorization if we run
   * into credential problems.
   */
  export
  function refreshAuthToken(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const googleAuth = gapi.auth2.getAuthInstance();
      const user = googleAuth.currentUser.get();
      user.reloadAuthResponse().then(authResponse => {
        setAuthToken();
        resolve(void 0);
      }, err => {
        console.error('gapi: Error on refreshing authorization!');
        setAuthToken();
        reject(err);
      });
    });
  }

  /**
   * If the current user state has changed, there has either
   * been a log in/out, or the auth has automatically refreshed.
   * Manually reset the auth token so that the realtime API can
   * pick it up.
   */
  export
  function onAuthRefreshed(): void {
    setAuthToken();
  }
}
