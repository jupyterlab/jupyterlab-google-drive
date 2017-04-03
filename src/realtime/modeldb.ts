// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ISignal, Signal
} from '@phosphor/signaling';

import {
  JSONValue, PromiseDelegate, JSONExt
} from '@phosphor/coreutils';

import {
  IModelDB, ModelDB, IObservableValue, IObservableVector, ObservableValue,
  IObservableMap, IObservableString, IObservable, IObservableUndoableVector
} from '@jupyterlab/coreutils';

import {
  GoogleSynchronizable
} from './googlerealtime';

import {
  GoogleString
} from './string';

import {
  GoogleVector
} from './vector';

import {
  GoogleUndoableVector
} from './undoablevector';

import {
  GoogleMap
} from './map';

import {
  getResourceForPath, loadRealtimeDocument
} from '../drive/drive';


export
class GoogleModelDB implements IModelDB {
  constructor(options: GoogleModelDB.ICreateOptions) {
    this._basePath = options.basePath || '';
    this._filePath = options.filePath;
    if(options.baseDB) {
      this._baseDB = options.baseDB;
      this._baseDB.changed.connect((db, args)=>{
        this._changed.emit({
          path: args.path
        });
      })
    } else {
      if(options.model) {
        this._model = options.model;
      } else {
        this._doc = gapi.drive.realtime.newInMemoryDocument();
        this._model = this._doc.getModel();
        getResourceForPath(options.filePath).then((resource: any) => {
          loadRealtimeDocument(resource.id).then((doc: gapi.drive.realtime.Document) => {
            this._doc = doc;
            this._model = doc.getModel();
            let oldDB = this._db;
            this._db = new GoogleMap(this._model.getRoot());
            for(let key of oldDB.keys()) {
              let val = this._localDB.get(key);
              if(this._db.has(key)) {
                let gval = this._db.get(key);
                if(val.googleObject) {
                  val.googleObject = gval;
                }
              } else {
                if(val.googleObject) {
                  let newVal: gapi.drive.realtime.CollaborativeObject;
                  if(val.googleObject.type === 'EditableString') {
                    newVal = this._model.createString(val.text);
                  } else if (val.googleObject.type === 'List') {
                    newVal = this._model.createList(val.googleObject.asArray());
                  } else if (val.googleObject.type === 'Map') {
                    newVal = this._model.createMap();
                    for(let item of val.keys()) {
                      (newVal as any).set(item, val.get(item));
                    }
                  }
                  val.googleObject = newVal;
                  this._db.set(key, newVal);
                } else if (val instanceof ObservableValue) {
                  this.set(key, val);
                }
              }
            }
            this._connected.resolve(void 0);
          });
        });
      }
      this._db = new GoogleMap(this._model.getRoot());
      this._db.changed.connect((db, args)=>{
        this._changed.emit({
          path: args.key,
        });
      });
    }
  }

  get model(): gapi.drive.realtime.Model {
    if(this._baseDB) {
      return this._baseDB.model;
    } else {
      return this._model;
    }
  }

  get doc(): gapi.drive.realtime.Document {
    return this._doc;
  }

  get basePath(): string {
    return this._basePath;
  }

  get changed(): ISignal<this, ModelDB.IChangedArgs> {
    return this._changed;
  }

  get connected(): Promise<void> {
    return this._connected.promise;
  }

  get(path: string): IObservable {
    return this._localDB.get(path);
  }

  getGoogleObject(path: string): any {
    if(this._baseDB) {
      return this._baseDB.getGoogleObject(this._basePath+'/'+path);
    } else {
      return this._db.get(path);
    }
  }

  has(path: string): boolean {
    if(this._baseDB) {
      return this._baseDB.has(this._basePath+'/'+path);
    } else {
      return this._db.has(path);
    }
  }

  set(path: string, value: IObservable): void {
    this._localDB.set(path, value);
    if(this._baseDB) {
      this._baseDB.set(this._basePath+'/'+path, value);
    } else {
      let toSet: any;
      if(value && (value as any).googleObject) {
        toSet = (value as any).googleObject;
      } else if (value instanceof ObservableValue) {
        toSet = (value as any).get();
        value.changed.connect((obs, args) => {
          if(!JSONExt.deepEqual(args.newValue, this._db.get(path))) {
            this._db.set(path, args.newValue);
          }
        });
        this._db.changed.connect((db, args) => {
          if(args.key === path &&
             !JSONExt.deepEqual(args.newValue, value.get())) {
            value.set(args.newValue);
          }
        });
      } else {
        toSet = value;
      }
      this._db.set(path, toSet);
    }
  }

  createString(path: string): IObservableString {
    let str: gapi.drive.realtime.CollaborativeString;
    if(this.has(path)) {
      str = this.getGoogleObject(path);
    } else {
      str = this.model.createString();
    }
    let newStr = new GoogleString(str);
    this.set(path, newStr);
    return newStr;
  }

  createVector(path: string): IObservableVector<JSONValue> {
    let vec: gapi.drive.realtime.CollaborativeList<JSONValue>;
    if(this.has(path)) {
      vec = this.getGoogleObject(path);
    } else {
      vec = this.model.createList<JSONValue>();
    }
    let newVec = new GoogleVector<JSONValue>(vec);
    this.set(path, newVec);
    return newVec;
  }

  createUndoableVector(path: string): IObservableUndoableVector<JSONValue> {
    let vec: gapi.drive.realtime.CollaborativeList<JSONValue>;
    if(this.has(path)) {
      vec = this.getGoogleObject(path);
    } else {
      vec = this.model.createList<JSONValue>();
    }
    let newVec = new GoogleUndoableVector(vec);
    this.set(path, newVec);
    return newVec;
  }

  createMap(path: string): IObservableMap<JSONValue> {
    let map: gapi.drive.realtime.CollaborativeMap<JSONValue>;
    if(this.has(path)) {
      map = this.getGoogleObject(path);
    } else {
      map = this.model.createMap<JSONValue>();
    }
    let newMap = new GoogleMap<JSONValue>(map);
    this.set(path, newMap);
    return newMap;
  }

  createValue(path: string): IObservableValue {
    let val: JSONValue = '';
    if(this.has(path)) {
      val = this.getGoogleObject(path);
    }
    let newVal = new ObservableValue(val);
    this.set(path, newVal);
    return newVal;
  }

  view(basePath: string): GoogleModelDB {
    return new GoogleModelDB({filePath: this._filePath, basePath, baseDB: this});
  }

  private _filePath: string;
  private _changed = new Signal<this, ModelDB.IChangedArgs>(this);
  private _db: GoogleMap<GoogleSynchronizable>;
  private _localDB = new Map<string, any>();
  private _model: gapi.drive.realtime.Model;
  private _doc: gapi.drive.realtime.Document;
  private _basePath: string;
  private _baseDB: GoogleModelDB = null;
  private _connected = new PromiseDelegate<void>()
}

export
namespace GoogleModelDB {
  export
  interface ICreateOptions {
    filePath: string;
    model?: gapi.drive.realtime.Model;
    basePath?: string;
    baseDB?: GoogleModelDB;
  }
}
