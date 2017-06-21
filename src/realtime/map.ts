// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  Signal, ISignal
} from '@phosphor/signaling';

import {
  IObservableMap
} from '@jupyterlab/coreutils';

import {
  GoogleRealtimeObject, GoogleSynchronizable
} from './googlerealtime';

/**
 * Realtime map which wraps `gapi.drive.realtime.CollaborativeMap`
 */
export
class GoogleMap<T extends GoogleSynchronizable> implements IObservableMap<T>, GoogleRealtimeObject {

  /**
   * Constructor
   */
  constructor(map: gapi.drive.realtime.CollaborativeMap<T>, itemCmp?: (first: T, second: T) => boolean) {
    this._itemCmp = itemCmp || Private.itemCmp;
    this.googleObject = map;
  }

  /**
   * The type of the Observable.
   */
  get type(): 'Map' {
    return 'Map';
  }


  /**
   * A signal emitted when the map has changed.
   */
  get changed(): ISignal<this, IObservableMap.IChangedArgs<T>> {
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
   * Get the underlying `gapi.drive.realtime.CollaborativeMap`
   * for this map.
   */
  get googleObject(): gapi.drive.realtime.CollaborativeMap<T> {
    return this._map;
  }

  /**
   * Set the underlying `gapi.drive.realtime.CollaborativeMap`
   * for this object.
   */
  set googleObject(map: gapi.drive.realtime.CollaborativeMap<T>) {
    // Recreate the new map locally to fire the right signals.
    if(this._map) {
      this._map.clear();
      for(let key of map.keys()) {
        this.set(key, map.get(key));
      }
      this._map.removeAllEventListeners();
    }

    // Set the new map.
    this._map = map;

    // Hook up event listeners to the new map.
    this._map.addEventListener(
      gapi.drive.realtime.EventType.VALUE_CHANGED, (evt: any) => {
        if(!evt.isLocal) {
          let changeType: IObservableMap.ChangeType;
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
    let oldVal = this.get(key);
    if (oldVal !== undefined && this._itemCmp(oldVal, value)) {
      return;
    }
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
    let val = this._map.get(key);
    return val === null ? undefined : val;
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
    let oldVal = this.get(key);
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

  private _changed = new Signal<this, IObservableMap.IChangedArgs<T>>(this);
  private _map: gapi.drive.realtime.CollaborativeMap<T> = null;
  private _itemCmp: (first: T, second: T) => boolean = null;
  private _isDisposed: boolean = false;
}

/**
 * The namespace for module private data.
 */
namespace Private {
  /**
   * The default strict equality item comparator.
   */
  export
  function itemCmp(first: any, second: any): boolean {
    return first === second;
  }
}
