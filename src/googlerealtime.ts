// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  clearSignalData, defineSignal, ISignal
} from 'phosphor/lib/core/signaling';

import {
  JSONObject
} from 'phosphor/lib/algorithm/json';

import {
  showDialog
} from 'jupyterlab/lib/dialog';

import {
  IRealtime, IRealtimeHandler, IRealtimeModel,
  ISynchronizable
} from 'jupyterlab/lib/realtime';

import {
  authorize, createPermissions,
  createRealtimeDocument, loadRealtimeDocument
} from './gapi';

import {
  GoogleRealtimeString, GoogleRealtimeVector
} from './datastructures';

import {
  IObservableString
} from 'jupyterlab/lib/common/observablestring';

import {
  IObservableUndoableVector
} from 'jupyterlab/lib/notebook/common/undo';

declare let gapi : any;

export
class GoogleRealtime implements IRealtime {

  get ready(): Promise<void> {
    return this._authorized;
  }

  shareDocument(model: IRealtimeModel): Promise<void> { 
    return new Promise<void>( (resolve, reject) => {
      if( !this._authorized ) {
        this._authorize();
      }
      this._authorized.then( () => {
        let input = document.createElement('input');
        showDialog({
          title: 'Email address...',
          body: input,
          okText: 'SHARE'
        }).then(result => {
          if (result.text === 'SHARE') {
            this._shareRealtimeDocument(model, input.value).then( ()=> {
              resolve();
            }).catch( ()=>{
              console.log("Google Realtime: unable to open shared document");
            });
          } else {
            resolve();
          }
        });
      }).catch( () => {
        console.log("Google Realtime: unable to authorize")
        reject();
      });
    });
  }

  openSharedDocument(model: IRealtimeModel): Promise<void> {
    return new Promise<void>((resolve,reject) => {
      if( !this._authorized ) {
        this._authorize();
      }
      this._authorized.then( () => {
        let input = document.createElement('input');
        showDialog({
          title: 'File ID...',
          body: input,
          okText: 'OPEN'
        }).then(result => {
          if (result.text === 'OPEN') {
            this._openRealtimeDocument(model, input.value).then(()=>{
              resolve();
            }).catch( ()=>{
              console.log("Google Realtime: unable to open shared document");
            });
          }
        });
      }).catch(()=>{
        console.log("Google Realtime: unable to authorize")
        reject();
      });
    });
  }

  protected _shareRealtimeDocument( model: IRealtimeModel, emailAddress : string) : Promise<GoogleRealtimeHandler> {
    return new Promise<GoogleRealtimeHandler>( (resolve, reject) => {
        let handler = new GoogleRealtimeHandler();
        model.registerCollaborative(handler);
        handler.ready.then( () => {
          createPermissions(handler.fileId, emailAddress).then( () => {
            resolve(handler);
          }).catch( () => {
            console.log("Google Realtime: unable to share document");
            reject(void 0);
          });
        });
    });
  }

  protected _openRealtimeDocument( model: IRealtimeModel, fileId: string) : Promise<GoogleRealtimeHandler> {
    return new Promise<GoogleRealtimeHandler>( (resolve, reject) => {
      let handler = new GoogleRealtimeHandler(fileId);
      model.registerCollaborative(handler).then( ()=>{;
        resolve(handler);
      });
    });
  }

  protected _authorize(): void {
    this._authorized = authorize();
  }

  private _authorized: Promise<void> = null;
}

export
class GoogleRealtimeHandler implements IRealtimeHandler {
  constructor( fileId : string = '' ) {
    this.ready = new Promise<void>( (resolve, reject) => {
      if (fileId) {
        this._fileId = fileId;
        this._creator = false;
        loadRealtimeDocument(this._fileId).then( (doc : gapi.drive.realtime.Document) => {
          this._doc = doc;
          this._model = this._doc.getModel();
          resolve();
        }).catch( () => {
          console.log("gapi: unable to load realtime document")
          reject();
        });
      } else {
        this._creator = true;
        createRealtimeDocument().then( (fileId: string) => {
          this._fileId = fileId;
          loadRealtimeDocument(fileId).then( (doc : gapi.drive.realtime.Document) => {
            this._doc = doc;
            this._model = this._doc.getModel();
            resolve();
          });
        }).catch( () => {
          console.log("gapi: unable to create realtime document")
          reject();
        });
      }
    });
  }

  linkString (str: IObservableString) : Promise<void> {
    return new Promise<void>( (resolve,reject) => {
      //Fail if the string is not linkable.
      if(!str.isLinkable) {
        reject();
      }
      this.ready.then( () => {
        //Create the collaborative string
        let gstr = new GoogleRealtimeString(
          this._model, 'collabStr', str.text);
        str.link(gstr);
        resolve();
      });
    });
  }

  linkVector<T extends ISynchronizable<T>>(vec: IObservableUndoableVector<T>) : Promise<void> {
    return new Promise<void>( (resolve,reject) => {
      //Fail if the vector is not linkable.
      if(!vec.isLinkable) {
        reject();
      }
      this.ready.then( () => {
        //Create the collaborative string
        let gvec = new GoogleRealtimeVector<T>
          (vec.factory, this._model, 'collabVec', vec);
        vec.link(gvec);
        resolve();
      });
    });
  }

  get fileId() : string {
    return this._fileId;
  }

  private _creator : boolean;
  private _fileId : string = '';
  private _doc : gapi.drive.realtime.Document = null;
  private _model : gapi.drive.realtime.Model = null;
  ready : Promise<void> = null;
}
