// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  Signal, ISignal
} from '@phosphor/signaling';

import {
  ICollaborator, IObservableMap
} from '@jupyterlab/coreutils';


export
class CollaboratorMap implements IObservableMap<ICollaborator> {

  constructor(doc: gapi.drive.realtime.Document) {
    // Get the map with the collaborators, or
    // create it if it does not exist.
    const id = 'internal:collaborators';
    this._doc = doc;
    this._map = doc.getModel().getRoot().get(id);

    // We need to create the map
    if(!this._map) {
      this._map = doc.getModel().createMap<ICollaborator>();
      doc.getModel().getRoot().set(id, this._map);
    }

    // Populate the map with its initial values.
    // Even if the map already exists, it is easy to miss
    // some collaborator events (if, for instance, the
    // realtime doc is not shut down properly).
    // This is an opportunity to refresh it.
    const initialCollaborators: any[] = doc.getCollaborators();

    // Remove stale collaborators.
    const initialSessions = new Set<string>();
    for(let i=0; i<initialCollaborators.length; i++) {
      initialSessions.add(initialCollaborators[i].sessionId);
    }
    for(let k of this._map.keys()) {
      if(!initialSessions.has(k)) {
        this._map.delete(k);
      }
    }
    // Now add the remaining collaborators.
    for(let i=0; i<initialCollaborators.length; i++) {
      const collaborator: ICollaborator = {
        userId: initialCollaborators[i].userId,
        sessionId: initialCollaborators[i].sessionId,
        displayName: initialCollaborators[i].displayName,
        color: initialCollaborators[i].color,
        shortName: (initialCollaborators[i].displayName as string).split(' ')
                   .filter(s => s).map(s => s[0]).join('')

      }
      if(!this._map.has(collaborator.sessionId)) {
        this._map.set(collaborator.sessionId, collaborator);
        if(initialCollaborators[i].isMe) {
          this._localCollaborator = collaborator;
        }
      }
    }

    // Add event listeners to the CollaboratorMap.
    this._doc.addEventListener(
      gapi.drive.realtime.EventType.COLLABORATOR_JOINED,
      (evt: any) => {
        const collaborator: ICollaborator = {
          userId: evt.collaborator.userId,
          sessionId: evt.collaborator.sessionId,
          displayName: evt.collaborator.displayName,
          color: evt.collaborator.color,
          shortName: (evt.collaborator.displayName as string).split(' ')
                     .filter(s => s).map(s => s[0]).join('')
        }
        this.set(collaborator.sessionId, collaborator);
        if(evt.collaborator.isMe) {
          this._localCollaborator = collaborator;
        }
      }
    );
    this._doc.addEventListener(
      gapi.drive.realtime.EventType.COLLABORATOR_LEFT,
      (evt: any) => {
        this.delete(evt.collaborator.sessionId);
      }
    );

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
   * The type of the Observable.
   */
  get type(): 'Map' {
    return 'Map';
  }

  /**
   * The number of key-value pairs in the map.
   */
  get size(): number {
    return this._map.size;
  }

  /**
   * A signal emitted when the map has changed.
   */
  get changed(): ISignal<this, IObservableMap.IChangedArgs<ICollaborator>> {
    return this._changed;
  }


  /**
   * Whether this map has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  get localCollaborator(): ICollaborator {
    return this._localCollaborator;
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
  set(key: string, value: ICollaborator): ICollaborator | undefined {
    const oldVal = this.get(key);
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
  get(key: string): ICollaborator | undefined {
    const val = this._map.get(key);
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
  values(): ICollaborator[] {
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
  delete(key: string): ICollaborator | undefined {
    const oldVal = this.get(key);
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
   * Set the CollaboratorMap to an empty map.
   */
  clear(): void {
    // Delete one by one to emit the correct signals.
    const keyList = this.keys();
    for (let i = 0; i < keyList.length; i++) {
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
    this._isDisposed = true;
    Signal.clearData(this);
    this._map.removeAllEventListeners();
  }

  private _localCollaborator: ICollaborator;
  private _doc: gapi.drive.realtime.Document;
  private _map: gapi.drive.realtime.CollaborativeMap<ICollaborator>;
  private _isDisposed: boolean = false;
  private _changed = new Signal<this, IObservableMap.IChangedArgs<ICollaborator>>(this);
}
