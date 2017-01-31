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
} from 'jupyterlab/lib/common/dialog';

import {
  IObservableMap, ObservableMap
} from 'jupyterlab/lib/common/observablemap';

import {
  IObservableString, ObservableString
} from 'jupyterlab/lib/common/observablestring';

import {
  IObservableVector, ObservableVector
} from 'jupyterlab/lib/common/observablevector';

import {
  IObservableUndoableVector, ObservableUndoableVector
} from 'jupyterlab/lib/common/undoablevector';

import {
  IRealtime, IRealtimeHandler, IRealtimeModel,
  ISynchronizable, ICollaborator
} from 'jupyterlab/lib/common/realtime';

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
    return handler.ready.then( ()=> {
      return model.registerCollaborative(handler);
    }).then( ()=>{
      return handler;
    });
  }

  private _trackerSet = new Set<[InstanceTracker<Widget>, (widget: Widget)=>IRealtimeModel]>();
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

  /**
   * Create a map for the realtime model.
   *
   * @param map: the string to link to a realtime map.
   *
   * @returns a promise when the linking is done.
   */
  linkMap<T>(map: IObservableMap<T>, id: string, parent?: IObservableMap<any>) : Promise<void> {
    //Fail if the vector is not linkable.
    if(!map.isLinkable) {
      return Promise.reject(void 0);
    }
    return this.ready.then( () => {
      //Create the collaborative map
      let gmap = new GoogleRealtimeMap<T>(this._model, id, parent, map);
      let keys = map.keys();
      let promises: Promise<void>[] = [];
      for(let key of keys) {
        let value: any = map.get(key);
        if(value instanceof ObservableMap) {
          promises.push(this.linkMap(value, key, map));
        } else if(value instanceof ObservableString) {
          promises.push(this.linkString(value, key, map));
        } else if(value instanceof ObservableUndoableVector) {
          promises.push(this.linkVector(value, key, map));
        }
      }
      this._rtObjects.push(gmap);
      map.link(gmap);
      return Promise.all(promises).then(()=>{return void 0;});
    });
  }

  /**
   * Create a string for the realtime model.
   *
   * @param str: the string to link to a realtime string.
   *
   * @returns a promise when the linking is done.
   */
  linkString (str: IObservableString, id: string, parent?: IObservableMap<any>) : Promise<void> {
    //Fail if the string is not linkable.
    if(!str.isLinkable) {
      return Promise.reject(void 0);
    }
    return this.ready.then( () => {
      //Create the collaborative string
      let gstr = new GoogleRealtimeString(this._model, id, parent, str.text);
      str.link(gstr);
      this._rtObjects.push(gstr);
      return void 0;
    });
  }

  /**
   * Create a vector for the realtime model.
   *
   * @param vec: the string to link to a realtime vector.
   *
   * @returns a promise when the linking is done.
   */
  linkVector<T extends ISynchronizable<T>>(vec: IObservableUndoableVector<T>, id: string, parent?: IObservableMap<any>) : Promise<void> {
    //Fail if the vector is not linkable.
    if(!vec.isLinkable) {
      return Promise.reject(void 0);
    }
    return this.ready.then( () => {
      //Create the collaborative vector
      let gvec = new GoogleRealtimeVector<T>
        (vec.factory, this._model, id, parent, vec);
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
  private _ready : Promise<void> = null;
}

/**
 * Take an item which is to be inserted into a collaborative
 * map or vector, and convert it into a form that the Google
 * Realtime API knows how to sync. In the case of primitives,
 * or things that are already JSONObjects, this means no change.
 */
export
function toSynchronizable(item: any): any {
  return item.googleObject || item;
}

export
function fromSynchronizable(item: any): any {
  if(item.type && item.type === 'EditableString') {
    return new ObservableString(item.getText());
  } else if(item.type && item.type === 'List') {
    return new ObservableVector(item.asArray());
  } else if(item.type && item.type === 'Map') {
    let map = new ObservableMap();
    for (let key of item.keys()) {
      map.set(key, item.get(key));
    }
    return map;
  } else {
    return item;
  }
}
