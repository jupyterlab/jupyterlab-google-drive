// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  DisposableSet
} from '@phosphor/disposable';

import {
  JSONValue, PromiseDelegate, JSONExt, JSONObject
} from '@phosphor/coreutils';

import {
  Signal, ISignal
} from '@phosphor/signaling';

import {
  IModelDB, IObservableValue, ObservableValue, IObservableString, 
  IObservable, IObservableUndoableList, IObservableJSON
} from '@jupyterlab/observables';

import {
  CollaboratorMap
} from './collaborator';

import {
  GoogleSynchronizable, GoogleRealtimeObject
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
 * Wrapper for bare null values, which do not
 * work well in the Google realtime model databases.
 */
const NULL_WRAPPER: JSONObject = { _internalNullObject3141592654: null };

/**
 * A class representing an IObservableValue, which
 * listens for changes to a `gapi.drive.realtime.Model`.
 */
export
class GoogleObservableValue implements IObservableValue {
  /**
   * Constructor for the value.
   *
   * @param path: the fully qualified path for the value (not a path on a view).
   *
   * @param model: a `gapi.drive.realtime.Model` in which to store the value.
   *
   * @param initialValue: the starting value for the `ObservableValue`.
   */
  constructor(path: string, model: gapi.drive.realtime.Model, initialValue?: JSONValue) {
    this._path = path;
    this._model = model;

    // Construct the change handler for the value.
    this._onValueChanged = (evt: any) => {
      if (evt.property === this._path) {
        this._changed.emit({
          oldValue: Private.resolveValue(evt.oldValue),
          newValue: Private.resolveValue(evt.newValue)
        });
      }
    }

    // Possibly set the initial value.
    if (initialValue)  {
      model.getRoot().set(path, initialValue);
    }

    // Listen for changes to the value.
    model.getRoot().addEventListener(
      gapi.drive.realtime.EventType.VALUE_CHANGED,
      this._onValueChanged);
  }

  /**
   * The observable type.
   */
  get type(): 'Value' {
    return 'Value';
  }

  /**
   * The `gapi.drive.realtime.Model` associated with the value.
   */
  set model(model: gapi.drive.realtime.Model) {
    if (model === this._model) {
      return;
    }
    // Set the value to that in the new model to fire the right signal.
    this._model.getRoot().set(this._path, model.getRoot().get(this._path));

    // Swap out the old model.
    const oldModel = this._model;
    this._model = model;

    // Hook up the right listeners.
    oldModel.getRoot().removeEventListener(
      gapi.drive.realtime.EventType.VALUE_CHANGED,
      this._onValueChanged);
    model.getRoot().addEventListener(
      gapi.drive.realtime.EventType.VALUE_CHANGED,
      this._onValueChanged);
  }
  get model(): gapi.drive.realtime.Model {
    return this._model;
  }

  /**
   * Whether the value has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * The changed signal.
   */
  get changed(): ISignal<this, ObservableValue.IChangedArgs> {
    return this._changed;
  }

  /**
   * Get the current value.
   */
  get(): JSONValue | undefined {
    return Private.resolveValue(this._model.getRoot().get(this._path));
  }

  /**
   * Set the current value.
   *
   * @param value: the value to set.
   */
  set(value: JSONValue): void {
    const oldVal = this.get();
    if (oldVal !== undefined && JSONExt.deepEqual(value, oldVal)) {
      return;
    }
    if (value === null) {
      this._model.getRoot().set(this._path, NULL_WRAPPER);
    } else {
      this._model.getRoot().set(this._path, value);
    }
  }

  /**
   * Dispose of the resources held by the value.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._model.getRoot().removeEventListener(
      gapi.drive.realtime.EventType.VALUE_CHANGED,
      this._onValueChanged);
    Signal.clearData(this);
  }

  private _path: string;
  private _isDisposed = false;
  private _model: gapi.drive.realtime.Model;
  private _changed = new Signal<this, ObservableValue.IChangedArgs>(this);
  private _onValueChanged: (evt: any) => void;
}

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

      this._connected = new PromiseDelegate<void>();
      this._localDB =
        new Map<string, GoogleRealtimeObject | GoogleObservableValue>();

      // If a testing documentLoader has been supplied, use that.
      const documentLoader = options.documentLoader || Private.documentLoader;

      // Wrap the model root in a `GoogleMap`.
      this._db = new GoogleMap(this._model.getRoot());

      // Load the document from Google Drive.
      documentLoader(options.filePath).then(doc => {
        // Update the references to the doc and model
        const oldDoc = this._doc;
        this._doc = doc;
        this._model = doc.getModel();

        const oldDB = this._db;
        this._db = new GoogleMap(this._model.getRoot());

        if (this._model.getRoot().size !== 0) {
          // If the model is not empty, it is coming prepopulated.
          this._isPrepopulated = true;

          // Iterate over the keys in the original, unconnected
          // model database. If there is a matching key in the
          // new one, plug in the GoogleRealtimeObject associated
          // with it. This takes care of updating the values
          // and sending the right signals.
          for (let key of oldDB.keys()) {
            const oldVal = this._localDB.get(key);
            if (this._db.has(key)) {
              const dbVal = this._db.get(key);
              if (oldVal.googleObject) {
                oldVal.googleObject = dbVal;
              } else if (oldVal instanceof GoogleObservableValue) {
                oldVal.model = this._model;
              }
            } else {
              oldVal.dispose();
            }
          }
        } else {
          // Handle the case where we populate the model.
          for(let key of oldDB.keys()) {
            const val = this._localDB.get(key);
            if(val.googleObject) {
              // If the value is a string, map, or list,
              // swap out the underlying Collaborative Object.
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
              } else {
                // Should not get here.
                throw Error('Unexpected collaborative object received');
              }
              val.googleObject = newVal;
              this._db.set(key, newVal);
            } else if (val.type === 'Value') {
              // If the value is just an IObservableValue, copy
              // the value into the new model object, then
              // set the model object so it can listen for the
              // right changes.
              this._model.getRoot().set(key, val.get());
              val.model = this._model;
            }
          }
        }

        // Set up the collaborators map.
        this._collaborators = new CollaboratorMap(this._doc);
        this._disposables.add(this._collaborators);

        // Clean up after the temporary in-memory document.
        oldDoc.removeAllEventListeners();
        oldDoc.close();

        this._connected.resolve(void 0);
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
    if (this._baseDB) {
      return this._baseDB.collaborators;
    }
    return this._collaborators;
  }

  /**
   * Get the underlying `gapi.drive.realtime.Model`.
   */
  get model(): gapi.drive.realtime.Model {
    if (this._baseDB) {
      return this._baseDB.model;
    } else {
      return this._model;
    }
  }

  /**
   * Get the underlying `gapi.drive.realtime.Document`.
   */
  get doc(): gapi.drive.realtime.Document {
    if (this._baseDB) {
      return this._baseDB.doc;
    } else {
      return this._doc;
    }
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
    return this._isDisposed;
  }

  /**
   * Get a value for a path.
   *
   * @param path: the path for the object.
   *
   * @returns an `IObservable`.
   */
  get(path: string): IObservable {
    if (this._baseDB) {
      return this._baseDB.get(this._basePath+'.'+path);
    } else {
      return this._localDB.get(path);
    }
  }

  /**
   * Get the object in the underlying `gapi.drive.realtime.CollaborativeMap`.
   * Not intended to be called by user code.
   *
   * @param path: the path for the object.
   */
  getGoogleObject(path: string): GoogleSynchronizable | undefined {
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
  set(path: string, value: GoogleRealtimeObject | GoogleObservableValue): void {
    if(this._baseDB) {
      this._baseDB.set(this._basePath+'.'+path, value);
    } else {
      this._localDB.set(path, value);
      if(value && (value as GoogleRealtimeObject).googleObject) {
        this._db.set(path, (value as GoogleRealtimeObject).googleObject);
      } else if (value && value.type === 'Value') {
        // Do nothing, it has already been set
        // at object creation time.
      } else {
        throw Error('Unexpected type set in GoogleModelDB');
      }
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
    const newStr = new GoogleString(str);
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
  createList<T extends JSONValue>(path: string): IObservableUndoableList<T> {
    let vec: gapi.drive.realtime.CollaborativeList<T>;
    if(this.has(path)) {
      vec = this.getGoogleObject(path) as gapi.drive.realtime.CollaborativeList<T>;
    } else {
      vec = this.model.createList<T>();
    }
    const newVec = new GoogleUndoableList<T>(vec);
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
    const newJSON = new GoogleJSON(json);
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
    let val: JSONValue = NULL_WRAPPER;
    if(this.has(path)) {
      val = this.getGoogleObject(path) as JSONValue;
    }
    const fullPath = this.fullPath(path);
    const newVal = new GoogleObservableValue(fullPath,
                                           this.model, val);
    this.set(path, newVal);
    this._disposables.add(newVal);
    return newVal;
  }

  /**
   * Get a value at a path. That value must already have
   * been created using `createValue`.
   *
   * @param path: the path for the value.
   */
  getValue(path: string): JSONValue | undefined {
    const val = this.get(path);
    if (val.type !== 'Value') {
        throw Error('Can only call getValue for an IObservableValue');
    }
    return (val as GoogleObservableValue).get();
  }

  /**
   * Set a value at a path. That value must already have
   * been created using `createValue`.
   *
   * @param path: the path for the value.
   *
   * @param value: the new value.
   */
  setValue(path: string, value: JSONValue): void {
    const val = this.get(path);
    if (val.type !== 'Value') {
        throw Error('Can only call setValue on an IObservableValue');
    }
    (val as GoogleObservableValue).set(value);
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
    const view = new GoogleModelDB({filePath: this._filePath, basePath, baseDB: this});
    this._disposables.add(view);
    return view;
  }

  /**
   * Dispose of the resources held by the database.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._disposables.dispose();

    // Possibly dispose of the doc if this is a root DB.
    if (this._doc) {
      this._doc.removeAllEventListeners();
      this._doc.close();
    }

    // Possibly dispose of the db if this is a root DB.
    if (this._db) {
      this._db.dispose();
    }
  }

  /**
   * Compute the fully resolved path for a path argument.
   *
   * @param path: a path for the current view on the model.
   *
   * @returns a fully resolved path on the base model database.
   */
  fullPath(path: string): string {
    if (this._baseDB) {
      return this._baseDB.fullPath(this._basePath + '.' + path);
    } else {
      return path;
    }
  }

  private _filePath: string;
  private _isDisposed = false;
  private _db: GoogleMap<GoogleSynchronizable>;
  private _localDB: Map<string, any>;
  private _disposables = new DisposableSet();
  private _model: gapi.drive.realtime.Model;
  private _doc: gapi.drive.realtime.Document;
  private _basePath: string;
  private _baseDB: GoogleModelDB;
  private _connected: PromiseDelegate<void>;
  private _isPrepopulated = false;
  private _collaborators: CollaboratorMap;
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

    /**
     * A function to load a `gapi.drive.realtime.Document` given
     * a path. Meant only for testing purposes, and should not
     * be called by user code.
     */
    documentLoader?: (path: string) => Promise<gapi.drive.realtime.Document>;
  }
}

/**
 * A private namespace for `GoogleModelDB`.
 */
namespace Private {
  /**
   * Default document loader for the GoogleModelDB: load it
   * from the user's Google Drive account.
   */
  export
  function documentLoader(path: string): Promise<gapi.drive.realtime.Document> {
    return getResourceForPath(path).then((resource: any) => {
      return loadRealtimeDocument(resource);
    });
  }

  /**
   * Patch up a value coming out of a GoogleModelDB.
   * If `null` return `undefined`. If NULL_WRAPPER,
   * return `null`.
   */
  export
  function resolveValue(value: JSONValue): JSONValue | undefined {
    if (value === undefined || value === null) {
      return undefined;
    } else if (JSONExt.deepEqual(value, NULL_WRAPPER)) {
      return null;
    } else {
      return value;
    }
  }
}
