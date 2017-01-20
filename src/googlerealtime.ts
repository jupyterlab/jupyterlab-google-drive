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
  ISynchronizable, ICollaborator
} from 'jupyterlab/lib/realtime';

import {
  authorize, gapiAuthorized
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
  CollaboratorMap
} from './collaborator';

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
    return gapiAuthorized.promise;
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
    return this.ready.then( () => {
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
      return fileId;
    }).then((id: string)=>{
      //Open the realtime document
      return this._openRealtimeDocument(model, id);
    }).then(()=>{
      return void 0;
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
    let handler = model.realtimeHandler as any; //GoogleRealtimeHandler;
    return handler.ready.then( () => {
      return createPermissions(handler.fileId, emailAddress);
    });
  }

  protected _openRealtimeDocument( model: IRealtimeModel, fileId: string) : Promise<GoogleRealtimeHandler> {
    let handler = new GoogleRealtimeHandler(fileId);
    return model.registerCollaborative(handler).then( ()=>{;
      return handler;
    });
  }

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
          this._collaborators = new CollaboratorMap(doc);
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
            this._collaborators = new CollaboratorMap(doc);
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
   * Get a map of the collaborators on this handler.
   */
  get collaborators(): CollaboratorMap {
    return this._collaborators;
  }

  /**
   * Create a string for the realtime model.
   *
   * @param str: the string to link to a realtime string.
   *
   * @returns a promise when the linking is done.
   */
  linkString (str: IObservableString, id: string) : Promise<void> {
    //Fail if the string is not linkable.
    if(!str.isLinkable) {
      return Promise.reject(void 0);
    }
    return this.ready.then( () => {
      //Create the collaborative string
      let gstr = new GoogleRealtimeString(this._model, id, str.text);
      str.link(gstr);
      this._rtObjects.push(gstr);
      return void 0;
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
    //Fail if the vector is not linkable.
    if(!vec.isLinkable) {
      return Promise.reject(void 0);
    }
    return this.ready.then( () => {
      //Create the collaborative string
      let gvec = new GoogleRealtimeVector<T>
        (vec.factory, this._model, id, vec);
      vec.link(gvec);
      this._rtObjects.push(gvec);
      return void 0;
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

  /**
   * Get whether the handler is disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose of the resources held by the handler.
   */
  dispose(): void {
    if(this._isDisposed) {
      return;
    }
    this._collaborators.dispose();
    for(let i=0; i<this._rtObjects.length; i++) {
      let item: any = this._rtObjects[i];
      item.dispose();
    }
    this._doc.removeAllEventListeners();
    this._doc.close();
    this._doc = null;
    this._isDisposed = true;
  }


  private _isDisposed: boolean = false;
  private _collaborators: CollaboratorMap = null;
  private _fileId: string = '';
  private _doc: gapi.drive.realtime.Document = null;
  private _model: gapi.drive.realtime.Model = null;
  private _rtObjects: any[] = [];
  ready : Promise<void> = null;
}
