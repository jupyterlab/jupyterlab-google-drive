// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  Widget
} from '@phosphor/widgets';

import {
  JSONObject
} from '@phosphor/coreutils';

import {
  InstanceTracker
} from 'jupyterlab/lib/apputils/instancetracker';

import {
  Dialog, showDialog
} from 'jupyterlab/lib/apputils/dialog';

import {
  IObservableMap, ObservableMap
} from 'jupyterlab/lib/coreutils/observablemap';

import {
  IObservableString, ObservableString
} from 'jupyterlab/lib/coreutils/observablestring';

import {
  IObservableVector, ObservableVector
} from 'jupyterlab/lib/coreutils/observablevector';

import {
  IRealtime, IRealtimeHandler, IRealtimeModel,
  Synchronizable, ICollaborator
} from 'jupyterlab/lib/coreutils/realtime';

import {
  IModelDB
} from 'jupyterlab/lib/coreutils/modeldb';

import {
  authorize, gapiAuthorized
} from '../gapi';

import {
  createPermissions, createRealtimeDocument, loadRealtimeDocument
} from '../drive/drive';

import {
  GoogleRealtimeString
} from './realtimestring';

import {
  GoogleRealtimeVector
} from './realtimevector';

import {
  GoogleRealtimeMap
} from './realtimemap';

import {
  CollaboratorMap, GoogleRealtimeCollaborator
} from './collaborator';

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
        buttons: [Dialog.cancelButton(), Dialog.okButton({label: 'SHARE'})]
      }).then(result => {
        if (result.accept) {
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
          buttons: [Dialog.cancelButton(), Dialog.okButton({label: 'OPEN'})]
        }).then(result => {
          if (result.accept) {
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
  addTracker(tracker: InstanceTracker<Widget>, getModel: (widget: Widget)=>IRealtimeModel, callback?: (widget: Widget)=>void): void {
    let cb = (widget: Widget)=>{};
    if(callback) {
      cb = callback;
    }
    this._trackerSet.add([tracker, getModel, cb]);
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
  checkTrackers( widget: Widget ): [IRealtimeModel, (widget: Widget)=>void] {
    let model: IRealtimeModel = null;
    let cb: (widget: Widget)=>void = null;
    this._trackerSet.forEach( ([tracker, getModel, callback]) => {
      if (tracker.has(widget)) {
        model = getModel(widget);
        cb = callback;
      }
    });
    return [model, cb];
  }

  protected _shareRealtimeDocument( model: IRealtimeModel, emailAddress : string) : Promise<void> {
    let handler = model.realtimeHandler as any; //GoogleRealtimeHandler;
    return handler.ready.then( () => {
      return createPermissions(handler.fileId, emailAddress);
    });
  }

  protected _openRealtimeDocument( model: IRealtimeModel, fileId: string) : Promise<GoogleRealtimeHandler> {
    let handler = new GoogleRealtimeHandler(fileId);
    return handler.ready.then( ()=> {
      return model.registerCollaborative(handler);
    }).then( ()=>{
      return handler;
    });
  }

  private _trackerSet = new Set<[InstanceTracker<Widget>, (widget: Widget)=>IRealtimeModel, (widget: Widget)=>void]>();
}



export
class GoogleRealtimeHandler implements IRealtimeHandler {
  constructor( fileId : string = '' ) {
    this._ready = new Promise<void>( (resolve, reject) => {
      if (fileId) {
        this._fileId = fileId;
        loadRealtimeDocument(this._fileId).then( (doc : gapi.drive.realtime.Document) => {
          this._doc = doc;
          this._model = this._doc.getModel();
          this._collaborators = new CollaboratorMap(doc);
          this._collaborators.ready.then(()=>{
            resolve();
          });
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
            this._collaborators.ready.then(()=>{
              resolve();
            });
          });
        }).catch( () => {
          console.log("gapi: unable to create realtime document")
          reject();
        });
      }
    });
  }

  /**
   * Get whether the handler is ready to be used.
   */
  get ready(): Promise<void> {
    return this._ready;
  }

  /**
   * Get a map of the collaborators on this handler.
   */
  get collaborators(): CollaboratorMap {
    return this._collaborators;
  }

  /**
   * Get the unique identifier for the collaborative
   * editing session of the local user.
   */
  get localCollaborator(): GoogleRealtimeCollaborator {
    return this._collaborators.localCollaborator;
  }

  get modelDB(): IModelDB {
    return this._modelDB;
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
  private _ready : Promise<void> = null;
  private _modelDB: IModelDB;
}


/**
 * An base class for wrappers around collaborative strings,
 * maps, and lists.
 */
export
interface GoogleRealtimeObject {
  /**
   * Access to the underlying collaborative object.
   */
  readonly googleObject: gapi.drive.realtime.CollaborativeObject;
}

/**
 * A type alias for the types of objects which may be inserted into
 * a Google Realtime Map/List and function correctly. More complex
 * models/objects will not work, and must be converted to/from one
 * of these types before insertion.
 */
export
type GoogleSynchronizable = any;
