// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  Widget
} from 'phosphor/lib/ui/widget';

import {
  InstanceTracker
} from 'jupyterlab/lib/common/instancetracker';

import {
  showDialog
} from 'jupyterlab/lib/dialog';

import {
  IRealtime, IRealtimeHandler, IRealtimeModel,
  ISynchronizable
} from 'jupyterlab/lib/realtime';

import {
  authorize
} from './gapi';

import {
  createPermissions, createRealtimeDocument, loadRealtimeDocument
} from './drive';

import {
  GoogleRealtimeString
} from './realtimestring';

import {
  GoogleRealtimeVector
} from './realtimevector';

import {
  IObservableString
} from 'jupyterlab/lib/common/observablestring';

import {
  IObservableUndoableVector
} from 'jupyterlab/lib/notebook/common/undo';

declare let gapi : any;

export
class GoogleRealtime implements IRealtime {

  /**
   * A promise that is resolved when the services
   * are ready to be used.
   */
  get ready(): Promise<void> {
    return this._authorized;
  }

  /**
   * Share a realtime model.
   *
   * @param model: the model to be shared.
   *
   * @returns a promise that is resolved when the model
   *   has been successfully shared.
   */
  addCollaborator(model: IRealtimeModel): Promise<void> {
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

  /**
   * Open a realtime model that has been shared.
   *
   * @param model: the model to be shared.
   *
   * @returns a promise that is resolved when the model
   *   has been successfully opened.
   */
  shareModel(model: IRealtimeModel, uid?: string): Promise<void> {
    return new Promise<void>((resolve,reject) => {
      if( !this._authorized ) {
        this._authorize();
      }
      this._authorized.then( () => {
        //If we are provided a fileId, use that.
        //Otherwise, query for one.
        let fileId = '';
        if(uid) {
          fileId = uid;
        } else {
          let input = document.createElement('input');
          showDialog({
            title: 'File ID...',
            body: input,
            okText: 'OPEN'
          }).then(result => {
            if (result.text === 'OPEN') {
              fileId = input.value;
            }
          });
        }

        //Open the realtime document
        this._openRealtimeDocument(model, fileId).then(()=>{
          resolve();
        }).catch( ()=>{
          console.log("Google Realtime: unable to open shared document");
          reject();
        });

      }).catch(()=>{
        console.log("Google Realtime: unable to authorize")
        reject();
      });
    });
  }

  /**
   * Register a realtime collaborative object with the
   * realtime services.
   *
   * @param tracker: a widget tracker that contains some
   *   shareable item.
   *
   * @param getModel: a function which takes a shareable widget
   *   and returns an object that implements `IRealtimeModel`,
   *   the actual collaborative data model.
   */
  addTracker(tracker: InstanceTracker<Widget>, getModel: (widget: Widget)=>IRealtimeModel): void {
    this._trackerSet.add([tracker, getModel]);
  }

  /**
   * Get a realtime model for a widget, for
   * use in registering an `IRealtimeModel` associated with
   * the widget as collaborative.
   *
   * @param widget: the widget in question.
   *
   * @returns an `IRealtimeModel` if `widget` belongs
   * to one of the realtime trackers, `null` otherwise.
   */
  checkTrackers( widget: Widget ): IRealtimeModel {
    let model: IRealtimeModel = null;
    this._trackerSet.forEach( ([tracker, getModel]) => {
      if (tracker.has(widget)) {
        model = getModel(widget);
      }
    });
    return model;
  }

  protected _shareRealtimeDocument( model: IRealtimeModel, emailAddress : string) : Promise<void> {
    return new Promise<void>( (resolve, reject) => {
      let handler = model.realtimeHandler as GoogleRealtimeHandler;
      handler.ready.then( () => {
        createPermissions(handler.fileId, emailAddress).then( () => {
          resolve();
        }).catch( () => {
          console.log("Google Realtime: unable to share document");
          reject();
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
  private _trackerSet = new Set<[InstanceTracker<Widget>, (widget: Widget)=>IRealtimeModel]>();
}

export
class GoogleRealtimeHandler implements IRealtimeHandler {
  constructor( fileId : string = '' ) {
    this.ready = new Promise<void>( (resolve, reject) => {
      if (fileId) {
        this._fileId = fileId;
        loadRealtimeDocument(this._fileId).then( (doc : gapi.drive.realtime.Document) => {
          this._doc = doc;
          this._model = this._doc.getModel();
          resolve();
        }).catch( () => {
          console.log("gapi: unable to load realtime document")
          reject();
        });
      } else {
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

  /**
   * Create a string for the realtime model.
   *
   * @param str: the string to link to a realtime string.
   *
   * @returns a promise when the linking is done.
   */
  linkString (str: IObservableString, id: string) : Promise<void> {
    return new Promise<void>( (resolve,reject) => {
      //Fail if the string is not linkable.
      if(!str.isLinkable) {
        reject();
      }
      this.ready.then( () => {
        //Create the collaborative string
        let gstr = new GoogleRealtimeString(
          this._model, id, str.text);
        str.link(gstr);
        resolve();
      });
    });
  }

  /**
   * Create a vector for the realtime model.
   *
   * @param factory: a method that takes a `JSONObject` representing a
   *   serialized vector entry, and creates an object from that.
   *
   * @param initialValue: the optional initial value of the vector.
   *
   * @returns a promise of a realtime vector.
   */
  linkVector<T extends ISynchronizable<T>>(vec: IObservableUndoableVector<T>, id: string) : Promise<void> {
    return new Promise<void>( (resolve,reject) => {
      //Fail if the vector is not linkable.
      if(!vec.isLinkable) {
        reject();
      }
      this.ready.then( () => {
        //Create the collaborative string
        let gvec = new GoogleRealtimeVector<T>
          (vec.factory, this._model, id, vec);
        vec.link(gvec);
        resolve();
      });
    });
  }

  /**
   * Get the Google Drive FileID associated with this
   * realtime handler.
   *
   * @returns a string of the file ID.
   */
  get fileId() : string {
    return this._fileId;
  }

  private _fileId : string = '';
  private _doc : gapi.drive.realtime.Document = null;
  private _model : gapi.drive.realtime.Model = null;
  ready : Promise<void> = null;
}
