// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  Signal, ISignal
} from '@phosphor/signaling';

import {
  JSONObject
} from '@phosphor/coreutils';

import {
  IRealtime, Synchronizable
} from 'jupyterlab/lib/coreutils/realtime';

import {
  IObservableMap, ObservableMap
} from 'jupyterlab/lib/coreutils/observablemap';

import {
  IObservableVector, ObservableVector
} from 'jupyterlab/lib/coreutils/observablevector';

import {
  IObservableString, ObservableString
} from 'jupyterlab/lib/coreutils/observablestring';

import {
  GoogleSynchronizable, GoogleRealtimeObject
} from './googlerealtime';

import {
  GoogleRealtimeVector
} from './realtimevector';

import {
  GoogleRealtimeString
} from './realtimestring';

declare let gapi : any;

export
class GoogleRealtimeMap<T> implements IObservableMap<T>, GoogleRealtimeObject {

  /**
   * Constructor
   */
  constructor( map: gapi.drive.realtime.CollaborativeMap<GoogleSynchronizable>, model: gapi.drive.realtime.Model) {
    this._model = model;

    //Create and populate the internal maps
    this._map = new ObservableMap<T>();
    this._gmap = map;
    for (let key of this._gmap.keys()) {
      let entry = this._gmap.get(key);
      this._map.set(key, entry);
    }

    //Hook up event listeners
    this._gmap.addEventListener(
      gapi.drive.realtime.EventType.VALUE_CHANGED, (evt: any)=>{
        if(!evt.isLocal) {
          let changeType: ObservableMap.ChangeType;
          if(evt.oldValue && evt.newValue) {
            changeType = 'change';
          } else if (evt.oldValue && !evt.newValue) {
            changeType = 'remove';
          } else {
            changeType = 'add';
          }
          let entry = evt.newValue;
          this._map.set(evt.property, entry);
          this._changed.emit({
            type: changeType,
            key: evt.property,
            oldValue: evt.oldValue,
            newValue: evt.newValue
          });
        }
      }
    );
  }

  type: 'Map';

  /**
   * A signal emitted when the map has changed.
   */
  get changed(): ISignal<GoogleRealtimeMap<T>, ObservableMap.IChangedArgs<T>> {
    return this._changed;
  }

  /**
   * The number of key-value pairs in the map.
   */
  get size(): number {
    return this._gmap.size;
  }

  /**
   * Whether this map has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Get the underlying collaborative object
   * for this map.
   */
  get googleObject(): gapi.drive.realtime.CollaborativeMap<GoogleSynchronizable> {
    return this._gmap;
  }

  /**
   * Set a key-value pair in the map
   *
   * @param key - The key to set.
   *
   * @param value - The value for the key.
   *
   * @returns the old value for the key, or undefined
   *   if that did not exist.
   */
  set(key: string, value: T): T {
    let oldVal = this._map.get(key);
    this._gmap.set(key, value);
    this._map.set(key, value);
    this._changed.emit({
      type: oldVal ? 'change' : 'add',
      key: key,
      oldValue: oldVal,
      newValue: value
    });
    return oldVal;
      
  }

  /**
   * Get a value for a given key.
   *
   * @param key - the key.
   *
   * @returns the value for that key.
   */
  get(key: string): T {
    return this._map.get(key);
  }

  /**
   * Check whether the map has a key.
   *
   * @param key - the key to check.
   *
   * @returns `true` if the map has the key, `false` otherwise.
   */
  has(key: string): boolean {
    return this._map.has(key);
  }

  /**
   * Get a list of the keys in the map.
   *
   * @returns - a list of keys.
   */
  keys(): string[] {
    return this._map.keys();
  }

  /**
   * Get a list of the values in the map.
   *
   * @returns - a list of values.
   */
  values(): T[] {
    return this._map.values();
  }

  /**
   * Remove a key from the map
   *
   * @param key - the key to remove.
   *
   * @returns the value of the given key,
   *   or undefined if that does not exist. 
   */
  delete(key: string): T {
    let oldVal = this._map.get(key);
    this._map.delete(key);
    this._gmap.delete(key);
    this._changed.emit({
      type: 'remove',
      key: key,
      oldValue: oldVal,
      newValue: undefined
    });
    return oldVal;
  }

  /**
   * Set the ObservableMap to an empty map.
   */
  clear(): void {
    //delete one by one so that we send
    //the appropriate signals.
    let keyList = this.keys();
    for(let i=0; i<keyList.length; i++) {
      this.delete(keyList[i]);
      this._gmap.delete(keyList[i]);
    }
  }

  /**
   * Dispose of the resources held by the map.
   */
  dispose(): void {
    if(this._isDisposed) {
      return;
    }
    Signal.clearData(this);
    this._gmap.removeAllEventListeners();
    this._map.clear();
    this._gmap = null;
    this._isDisposed = true;
  }

  private _changed = new Signal<GoogleRealtimeMap<T>, ObservableMap.IChangedArgs<T>>(this);
  private _model: gapi.drive.realtime.Model = null;
  private _gmap : gapi.drive.realtime.CollaborativeMap<GoogleSynchronizable> = null;
  private _map : ObservableMap<T> = null;
  private _isDisposed : boolean = false;
}
