// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ISignal, Signal
} from '@phosphor/signaling';

import {
  JSONValue, PromiseDelegate
} from '@phosphor/coreutils';

import {
  IModelDB, ModelDB, IModelDBFactory, IObservableValue,
  ObservableValue, IObservableVector, ObservableVector,
  IObservableMap, ObservableMap, IObservableString,
  ObservableString, IObservable
} from '@jupyterlab/coreutils';

import {
  GoogleSynchronizable
} from './googlerealtime';

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
  getResourceForPath, loadRealtimeDocument
} from '../drive/drive';


export
class GoogleModelDB implements IModelDB {
  constructor(options: GoogleModelDB.ICreateOptions) {
    this._basePath = options.basePath || '';
    if(options.baseDB) {
      this._baseDB = options.baseDB;
      this._model = options.baseDB.model;
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
            this._db = new GoogleRealtimeMap(this._model.getRoot());
            for(let key of oldDB.keys()) {
              if(this._db.has(key)) {
                let val = this._localDB.get(key);
                let gval = this._db.get(key);
                if(val.googleObject) {
                  val.googleObject = gval;
                }
              } else {
                let gval = oldDB.get(key);
                this._db.set(key, gval);
              }
            }
            this._connected.resolve(void 0);
          });
        });
      }
      this._db = new GoogleRealtimeMap(this._model.getRoot());
      this._db.changed.connect((db, args)=>{
        this._changed.emit({
          path: args.key,
        });
      });
    }
  }

  get model(): gapi.drive.realtime.Model {
    return this._model;
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

  set(path: string, value: IObservable): void {
    let toSet: any;
    if((value as any).googleObject) {
      toSet = (value as any).googleObject;
    } else if (value instanceof ObservableValue) {
      toSet = (value as any).get();
    } else {
      toSet = value;
    }
    if(this._baseDB) {
      this._baseDB.set(this._basePath+'/'+path, toSet);
    } else {
      this._db.set(path, toSet);
    }
    this._localDB.set(path, value);
  }

  createString(path: string): IObservableString {
    let str: gapi.drive.realtime.CollaborativeString;
    if(this._db.has(path)) {
      str = this._db.get(path);
    } else {
      str = this._model.createString();
    }
    let newStr = new GoogleRealtimeString(str);
    this._localDB.set(path, newStr);
    this._db.set(path, str);
    return newStr;
  }

  createVector(path: string): IObservableVector<JSONValue> {
    let vec: gapi.drive.realtime.CollaborativeList<JSONValue>;
    if(this._db.has(path)) {
      vec = this._db.get(path);
    } else {
      vec = this._model.createList<JSONValue>();
    }
    let newVec = new GoogleRealtimeVector<JSONValue>(vec);
    this._localDB.set(path, newVec);
    this._db.set(path, vec);
    return newVec;
  }

  createMap(path: string): IObservableMap<JSONValue> {
    let map: gapi.drive.realtime.CollaborativeMap<JSONValue>;
    if(this._db.has(path)) {
      map = this._db.get(path);
    } else {
      map = this._model.createMap<JSONValue>();
    }
    let newMap = new GoogleRealtimeMap<JSONValue>(map);
    this._localDB.set(path, newMap);
    this._db.set(path, map);
    return newMap;
  }

  createValue(path: string): IObservableValue {
    let val: JSONValue = null;
    if(this._db.has(path)) {
      val = this._db.get(path);
    }
    let newVal = new ObservableValue(val);
    this._db.set(path, val);
    this._localDB.set(path, newVal);
    return newVal;
  }

  view(basePath: string): ModelDB {
    return new ModelDB({basePath, baseDB: this});
  }

  private _changed = new Signal<this, ModelDB.IChangedArgs>(this);
  private _db: GoogleRealtimeMap<GoogleSynchronizable>;
  private _localDB = new Map<string, any>();
  private _model: gapi.drive.realtime.Model;
  private _doc: gapi.drive.realtime.Document;
  private _basePath: string;
  private _baseDB: IModelDB = null;
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
