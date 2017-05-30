// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  DisposableSet
} from '@phosphor/disposable';

import {
  JSONValue, PromiseDelegate, JSONExt
} from '@phosphor/coreutils';

import {
  IModelDB, IObservableValue, ObservableValue, IObservableString, 
  IObservable, IObservableUndoableList, IObservableJSON
} from '@jupyterlab/coreutils';

import {
  CollaboratorMap
} from './collaborator';

import {
  GoogleSynchronizable
} from './googlerealtime';

import {
  GoogleString
} from './string';

import {
  GoogleUndoableList
} from './undoablelist';

import {
  GoogleMap
} from './map';

import {
  GoogleJSON
} from './json';

import {
  getResourceForPath, loadRealtimeDocument
} from '../drive/drive';


/**
 * Google Drive-based Model database that implements `IModelDB`.
 */
export
class GoogleModelDB implements IModelDB {
  /**
   * Constructor for the database.
   */
  constructor(options: GoogleModelDB.ICreateOptions) {
    this._basePath = options.basePath || '';
    this._filePath = options.filePath;
    if(options.baseDB) {
      // Handle the case of a view on an already existing database.
      this._baseDB = options.baseDB;
    } else {
      // More complicated if we have to load the database. The `IModelDB`
      // needs to be able to create objects immediately, so we create a
      // temporary in-memory document, and then transfer data as necessary
      // when the Google-Drive-backed document becomes available.
      this._doc = gapi.drive.realtime.newInMemoryDocument();
      this._model = this._doc.getModel();

      // Wrap the model root in a `GoogleMap`.
      this._db = new GoogleMap(this._model.getRoot());

      // Load the document from Google Drive.
      getResourceForPath(options.filePath).then((resource: any) => {
        loadRealtimeDocument(resource).then((doc: gapi.drive.realtime.Document) => {
          // Update the references to the doc and model
          this._doc = doc;
          this._model = doc.getModel();

          let oldDB = this._db;
          this._db = new GoogleMap(this._model.getRoot());

          if (this._model.getRoot().size !== 0) {
            // If the model is not empty, it is coming prepopulated.
            this._isPrepopulated = true;

            for (let key of oldDB.keys()) {
              let oldVal = this._localDB.get(key);
              if (this._db.has(key)) {
                let dbVal = this._db.get(key);
                if (oldVal.googleObject) {
                  oldVal.googleObject = dbVal;
                }
              }
            }
          } else {
            // Handle the case where we populate the model.
            for(let key of oldDB.keys()) {
              let val = this._localDB.get(key);
              if(val.googleObject) {
                let newVal: gapi.drive.realtime.CollaborativeObject;
                if(val.googleObject.type === 'EditableString') {
                  // Create a string.
                  newVal = this._model.createString(val.text);
                } else if (val.googleObject.type === 'List') {
                  // Create a list.
                  newVal = this._model.createList(val.googleObject.asArray());
                } else if (val.googleObject.type === 'Map') {
                  // Create a map.
                  newVal = this._model.createMap();
                  for(let item of val.keys()) {
                    (newVal as gapi.drive.realtime.CollaborativeMap<JSONValue>)
                    .set(item, val.get(item));
                  }
                }
                val.googleObject = newVal;
                this._db.set(key, newVal);
              } else if (val instanceof ObservableValue) {
                this.set(key, val);
              }
            }
          }

          // Set up the collaborators map.
          this._collaborators = new CollaboratorMap(this._doc);

          this._connected.resolve(void 0);
        });
      });
    }
  }

  /**
   * Whether the GoogleModelDB is collaborative.
   * Returns `true`.
   */
  readonly isCollaborative: boolean = true;

  /**
   * Get the CollaboratorMap.
   */
  get collaborators(): CollaboratorMap {
    return this._collaborators;
  }

  /**
   * Get the underlying `gapi.drive.realtime.Model`.
   */
  get model(): gapi.drive.realtime.Model {
    if(this._baseDB) {
      return this._baseDB.model;
    } else {
      return this._model;
    }
  }

  /**
   * Get the underlying `gapi.drive.realtime.Document`.
   */
  get doc(): gapi.drive.realtime.Document {
    return this._doc;
  }

  /**
   * The base path for the `GoogleModelDB`. This is prepended
   * to all the paths that are passed in to the member
   * functions of the object.
   */
  get basePath(): string {
    return this._basePath;
  }

  /**
   * Whether the model has been populated with
   * any model values.
   */
  get isPrepopulated(): boolean {
    if (this._baseDB) {
      return this._baseDB.isPrepopulated;
    } else {
      return this._isPrepopulated;
    }
  }

  /**
   * A promise resolved when the `GoogleModelDB` has
   * connected to Google Drive.
   */
  get connected(): Promise<void> {
    if (this._baseDB ) {
      return this._baseDB.connected;
    } else {
      return this._connected.promise;
    }
  }

  /**
   * Whether the database is disposed.
   */
  get isDisposed(): boolean {
    return this._doc === null;
  }

  /**
   * Get a value for a path.
   *
   * @param path: the path for the object.
   *
   * @returns an `IObservable`.
   */
  get(path: string): IObservable {
    return this._localDB.get(path);
  }

  /**
   * Get the object in the underlying `gapi.drive.realtime.CollaborativeMap`.
   * Not intended to be called by user code.
   *
   * @param path: the path for the object.
   */
  getGoogleObject(path: string): GoogleSynchronizable {
    if(this._baseDB) {
      return this._baseDB.getGoogleObject(this._basePath+'.'+path);
    } else {
      return this._db.get(path);
    }
  }

  /**
   * Whether the `GoogleModelDB` has an object at this path.
   *
   * @param path: the path for the object.
   *
   * @returns a boolean for whether an object is at `path`.
   */
  has(path: string): boolean {
    if(this._baseDB) {
      return this._baseDB.has(this._basePath+'.'+path);
    } else {
      return this._db.has(path);
    }
  }

  /**
   * Set a value at a path. Not intended to
   * be called by user code, instead use the
   * `create*` factory methods.
   *
   * @param path: the path to set the value at.
   *
   * @param value: the value to set at the path.
   */
  set(path: string, value: IObservable): void {
    this._localDB.set(path, value);
    if(this._baseDB) {
      this._baseDB.set(this._basePath+'.'+path, value);
    } else {
      let toSet: any;
      if(value && (value as any).googleObject) {
        toSet = (value as any).googleObject;
      } else if (value instanceof ObservableValue) {
        toSet = (value as any).get();
        value.changed.connect((obs, args) => {
          if(!JSONExt.deepEqual(args.newValue, this._db.get(path) as JSONValue)) {
            this._db.set(path, args.newValue);
          }
        });
        this._db.changed.connect((db, args) => {
          if(args.key === path &&
             !JSONExt.deepEqual(args.newValue as JSONValue, value.get())) {
            value.set(args.newValue as JSONValue);
          }
        });
      } else {
        toSet = value;
      }
      this._db.set(path, toSet);
    }
  }

  /**
   * Create a string and insert it in the database.
   *
   * @param path: the path for the string.
   *
   * @returns the string that was created.
   */
  createString(path: string): IObservableString {
    let str: gapi.drive.realtime.CollaborativeString;
    if(this.has(path)) {
      str = this.getGoogleObject(path) as gapi.drive.realtime.CollaborativeString;
    } else {
      str = this.model.createString();
    }
    let newStr = new GoogleString(str);
    this._disposables.add(newStr);
    this.set(path, newStr);
    return newStr;
  }

  /**
   * Create a list and insert it in the database.
   *
   * @param path: the path for the list.
   *
   * @returns the list that was created.
   *
   * #### Notes
   * The list can only store objects that are simple
   * JSON Objects and primitives.
   */
  createList(path: string): IObservableUndoableList<JSONValue> {
    let vec: gapi.drive.realtime.CollaborativeList<JSONValue>;
    if(this.has(path)) {
      vec = this.getGoogleObject(path) as gapi.drive.realtime.CollaborativeList<JSONValue>;
    } else {
      vec = this.model.createList<JSONValue>();
    }
    let newVec = new GoogleUndoableList(vec);
    this._disposables.add(newVec);
    this.set(path, newVec);
    return newVec;
  }

  /**
   * Create a map and insert it in the database.
   *
   * @param path: the path for the map.
   *
   * @returns the map that was created.
   *
   * #### Notes
   * The map can only store objects that are simple
   * JSON Objects and primitives.
   */
  createMap(path: string): IObservableJSON {
    let json: gapi.drive.realtime.CollaborativeMap<JSONValue>;
    if(this.has(path)) {
      json = this.getGoogleObject(path) as gapi.drive.realtime.CollaborativeMap<JSONValue>;
    } else {
      json = this.model.createMap<JSONValue>();
    }
    let newJSON = new GoogleJSON(json);
    this._disposables.add(newJSON);
    this.set(path, newJSON);
    return newJSON;
  }

  /**
   * Create an opaque value and insert it in the database.
   *
   * @param path: the path for the value.
   *
   * @returns the value that was created.
   */
  createValue(path: string): IObservableValue {
    let val: JSONValue = '';
    if(this.has(path)) {
      val = this.getGoogleObject(path) as JSONValue;
    }
    let newVal = new ObservableValue(val);
    this._disposables.add(newVal);
    this.set(path, newVal);
    return newVal;
  }

  /**
   * Get a value at a path. That value must already have
   * been created using `createValue`.
   *
   * @param path: the path for the value.
   */
  getValue(path: string): JSONValue {
    let val = this.get(path);
    if (val.type !== 'Value') {
        throw Error('Can only call getValue for an ObservableValue');
    }
    return (val as ObservableValue).get();
  }


  /**

  /**
   * Set a value at a path. That value must already have
   * been created using `createValue`.
   *
   * @param path: the path for the value.
   *
   * @param value: the new value.
   */
  setValue(path: string, value: JSONValue): void {
    let val = this.get(path);
    if (val.type !== 'Value') {
        throw Error('Can only call setValue on an ObservableValue');
    }
    (val as ObservableValue).set(value);
  }

  /**
   * Create a view onto a subtree of the model database.
   *
   * @param basePath: the path for the root of the subtree.
   *
   * @returns a `GoogleModelDB` with a view onto the original
   *   `GoogleModelDB`, with `basePath` prepended to all paths.
   */
  view(basePath: string): GoogleModelDB {
    return new GoogleModelDB({filePath: this._filePath, basePath, baseDB: this});
  }

  /**
   * Dispose of the resources held by the database.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    let db = this._db;
    this._db = null;
    this._doc = null;
    this._model = null;

    if (db) {
      db.dispose();
    }
    this._disposables.dispose();
  }

  private _filePath: string;
  private _db: GoogleMap<GoogleSynchronizable>;
  private _localDB = new Map<string, any>();
  private _disposables = new DisposableSet();
  private _model: gapi.drive.realtime.Model = null;
  private _doc: gapi.drive.realtime.Document = null;
  private _basePath: string;
  private _baseDB: GoogleModelDB = null;
  private _connected = new PromiseDelegate<void>()
  private _isPrepopulated = false;
  private _collaborators: CollaboratorMap = null;
}

/**
 * A namespace for the `GoogleModelDB` class statics.
 */
export
namespace GoogleModelDB {
  /**
   * Options for creating a `ModelDB` object.
   */
  export
  interface ICreateOptions {
    /**
     * The path for the location on Google Drive
     * to store the model.
     */
    filePath: string;

    /**
     * The base path to prepend to all the path arguments.
     */
    basePath?: string;

    /**
     * A `GoogleModelDB` to use as the store for this
     * `GoogleModelDB`. If none is given, it uses its own store.
     */
    baseDB?: GoogleModelDB;
  }
}
