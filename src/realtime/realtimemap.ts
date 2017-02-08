// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  clearSignalData, defineSignal, ISignal
} from 'phosphor/lib/core/signaling';

import {
  JSONObject
} from 'phosphor/lib/algorithm/json';

import {
  IRealtime, IRealtimeHandler, IRealtimeModel,
} from 'jupyterlab/lib/common/realtime';

import {
  IObservableMap, ObservableMap
} from 'jupyterlab/lib/common/observablemap';

import {
  GoogleSynchronizable
} from './googlerealtime';

import {
  toGoogleSynchronizable, fromGoogleSynchronizable,
} from './utils';

declare let gapi : any;

export
class GoogleRealtimeMap<Synchronizable> implements IObservableMap<Synchronizable> {

  /**
   * Constructor
   */
  constructor( map: IObservableMap<Synchronizable>) {
    this._map = new ObservableMap<Synchronizable>();
    for(let key of map.keys()) {
      this._map.set(key, map.get(key));
    }
  }

  /**
   * A signal emitted when the map has changed.
   */
  changed: ISignal<GoogleRealtimeMap<Synchronizable>, ObservableMap.IChangedArgs<Synchronizable>>;

  /**
   * Get whether this map can be linked to another.
   *
   * @returns `false`,
   */
  readonly isLinkable: boolean = false;

  /**
   * Get whether this map is linked to another.
   *
   * @returns `false`,
   */
  readonly isLinked: boolean = false;

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


  set googleObject(map: gapi.drive.realtime.CollaborativeMap<GoogleSynchronizable>) {
    //Create and populate the internal maps
    this._gmap = map;
    for (let key of this._gmap.keys()) {
      if(this._map.has(key) && (this._map.get(key) as any).fromJSON) {
        this._map.set(key, (this._map.get(key) as any).fromJSON(this._gmap.get(key)))
      } else {
        this._map.set(key, fromGoogleSynchronizable(this._gmap.get(key)) as any);
      }
    }

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
          if(this._map.has(evt.property) && (this._map.get(evt.property) as any).fromJSON) {
            this._map.set(evt.property, (this._map.get(evt.property) as any).fromJSON(evt.newValue))
          } else {
            this._map.set(evt.property, fromGoogleSynchronizable(evt.newValue) as any);
          }
          this.changed.emit({
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
  set(key: string, value: Synchronizable): Synchronizable {
    let oldVal = this._map.get(key);
    this._gmap.set(key, toGoogleSynchronizable(value) as any);
    this._map.set(key, value);
    this.changed.emit({
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
  get(key: string): Synchronizable {
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
  values(): Synchronizable[] {
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
  delete(key: string): Synchronizable {
    let oldVal = this._map.get(key);
    this._map.delete(key);
    this._gmap.delete(key);
    this.changed.emit({
      type: 'remove',
      key: key,
      oldValue: oldVal,
      newValue: undefined
    });
    return oldVal;
  }

  /**
   * Link the map to another map.
   * Any changes to either are mirrored in the other.
   *
   * @param map: the parent map.
   */
  link(map: IObservableMap<Synchronizable>): void {
    //no-op
  }

  /**
   * Unlink the map from its parent map.
   */
  unlink(): void {
    //no-op
  }

  linkSet(key: string, val: any, shadowVal: any): void {
    this._map.set(key, val as Synchronizable);
    this._gmap.set(key, toGoogleSynchronizable(shadowVal));
    val.link(shadowVal);
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
    clearSignalData(this);
    this._map.clear();
    this._gmap.removeAllEventListeners();
    this._gmap.clear();
    this._gmap = null;
    this._isDisposed = true;
  }

  private _gmap : gapi.drive.realtime.CollaborativeMap<GoogleSynchronizable> = null;
  private _map : ObservableMap<Synchronizable> = null;
  private _isDisposed : boolean = false;
}

// Define the signal for the collaborator map.
defineSignal(GoogleRealtimeMap.prototype, 'changed');
