// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  Signal, ISignal
} from '@phosphor/signaling';

import {
  IObservableMap, ObservableMap,
} from '@jupyterlab/coreutils';

import {
  GoogleSynchronizable, GoogleRealtimeObject
} from './googlerealtime';

declare let gapi : any;

export
class GoogleMap<T> implements IObservableMap<T>, GoogleRealtimeObject {

  /**
   * Constructor
   */
  constructor( map: gapi.drive.realtime.CollaborativeMap<GoogleSynchronizable>) {
    this.googleObject = map;
  }

  type: 'Map';

  /**
   * A signal emitted when the map has changed.
   */
  get changed(): ISignal<GoogleMap<T>, ObservableMap.IChangedArgs<T>> {
    return this._changed;
  }

  /**
   * The number of key-value pairs in the map.
   */
  get size(): number {
    return this._map.size;
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
    return this._map;
  }

  set googleObject(map: gapi.drive.realtime.CollaborativeMap<GoogleSynchronizable>) {
    if(this._map) {
      this._map.clear();
      for(let key of map.keys()) {
        this.set(key, map.get(key));
      }
      this._map.removeAllEventListeners();
    }

    //Hook up event listeners
    this._map = map;
    this._map.addEventListener(
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
    this._map.removeAllEventListeners();
    this._map = null;
    this._isDisposed = true;
  }

  private _changed = new Signal<GoogleMap<T>, ObservableMap.IChangedArgs<T>>(this);
  private _map : gapi.drive.realtime.CollaborativeMap<GoogleSynchronizable> = null;
  private _isDisposed : boolean = false;
}
