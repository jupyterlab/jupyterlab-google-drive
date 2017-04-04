// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  JSONValue
} from '@phosphor/coreutils';

import {
  IRealtime, IRealtimeHandler, IModelDB,
} from '@jupyterlab/coreutils';

import {
  gapiAuthorized
} from '../gapi';

import {
  GoogleModelDB
} from './modeldb';

import {
  CollaboratorMap, GoogleCollaborator
} from './collaborator';

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
   * Create a GoogleRealtimeHandler for use with
   * document models associated with a path on
   * the filesystem.
   */
  createHandler(path: string): GoogleRealtimeHandler {
    return new GoogleRealtimeHandler(path);
  }
}



export
class GoogleRealtimeHandler implements IRealtimeHandler {
  constructor( path : string ) {
    this._modelDB = new GoogleModelDB({filePath: path});
    this._ready = new Promise<void>( (resolve, reject) => {
      this._modelDB.connected.then(() => {
        this._doc = this._modelDB.doc;
        this._model = this._doc.getModel();
        this._collaborators = new CollaboratorMap(this._doc);
        this._collaborators.ready.then(()=>{
          resolve();
        });
      }).catch( () => {
        console.log("gapi: unable to load realtime document")
        reject();
      });
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
  get localCollaborator(): GoogleCollaborator {
    return this._collaborators.localCollaborator;
  }

  get modelDB(): IModelDB {
    return this._modelDB;
  }

  /**
   * Get whether the handler is disposed.
   */
  get isDisposed(): boolean {
    return this._doc === null;
  }

  /**
   * Dispose of the resources held by the handler.
   */
  dispose(): void {
    if(this._doc === null) {
      return;
    }
    let doc = this._doc;
    this._doc = null;
    this._collaborators.dispose();
    doc.removeAllEventListeners();
    doc.close();
  }

  private _collaborators: CollaboratorMap = null;
  private _doc: gapi.drive.realtime.Document = null;
  private _model: gapi.drive.realtime.Model = null;
  private _ready : Promise<void> = null;
  private _modelDB: GoogleModelDB;
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
type GoogleSynchronizable = JSONValue | gapi.drive.realtime.CollaborativeObject;
