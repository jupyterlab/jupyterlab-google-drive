// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  JSONValue
} from '@phosphor/coreutils';

import {
  each
} from '@phosphor/algorithm';

import {
  IObservableUndoableList, IObservableList,
} from '@jupyterlab/coreutils';

import {
  GoogleList
} from './list';

/**
 * A concrete implementation of a realtime undoable list.
 */
export
class GoogleUndoableList<T extends JSONValue> extends GoogleList<T> implements IObservableUndoableList<T> {
  /**
   * Construct a new undoable list.
   */
  constructor(list: gapi.drive.realtime.CollaborativeList<T>) {
    super(list);
    this.changed.connect(this._onListChanged, this);
  }

  /**
   * Whether the object can redo changes.
   */
  get canRedo(): boolean {
    return this._index < this._stack.length - 1;
  }

  /**
   * Whether the object can undo changes.
   */
  get canUndo(): boolean {
    return this._index >= 0;
  }

  /**
   * Dispose of the resources held by the model.
   */
  dispose(): void {
    this._stack = null;
    super.dispose();
  }

  /**
   * Begin a compound operation.
   *
   * @param isUndoAble - Whether the operation is undoable.
   *   The default is `true`.
   */
  beginCompoundOperation(isUndoAble?: boolean): void {
    this._inCompound = true;
    this._isUndoable = (isUndoAble !== false);
    this._madeCompoundChange = false;
  }

  /**
   * End a compound operation.
   */
  endCompoundOperation(): void {
    this._inCompound = false;
    this._isUndoable = true;
    if (this._madeCompoundChange) {
      this._index++;
    }
  }

  /**
   * Undo an operation.
   */
  undo(): void {
    if (!this.canUndo) {
      return;
    }
    let changes = this._stack[this._index];
    this._isUndoable = false;
    for (let change of changes.reverse()) {
      this._undoChange(change);
    }
    this._isUndoable = true;
    this._index--;
  }

  /**
   * Redo an operation.
   */
  redo(): void {
    if (!this.canRedo) {
      return;
    }
    this._index++;
    let changes = this._stack[this._index];
    this._isUndoable = false;
    for (let change of changes) {
      this._redoChange(change);
    }
    this._isUndoable = true;
  }

  /**
   * Clear the change stack.
   */
  clearUndo(): void {
    this._index = -1;
    this._stack = [];
  }

  /**
   * Handle a change in the list.
   */
  private _onListChanged(list: IObservableList<T>, change: IObservableList.IChangedArgs<T>): void {
    if (this.isDisposed || !this._isUndoable) {
      return;
    }
    // Clear everything after this position if necessary.
    if (!this._inCompound || !this._madeCompoundChange) {
      this._stack = this._stack.slice(0, this._index + 1);
    }
    // Copy the change.
    let evt = this._copyChange(change);
    // Put the change in the stack.
    if (this._stack[this._index + 1]) {
      this._stack[this._index + 1].push(evt);
    } else {
      this._stack.push([evt]);
    }
    // If not in a compound operation, increase index.
    if (!this._inCompound) {
      this._index++;
    } else {
      this._madeCompoundChange = true;
    }
  }

  /**
   * Undo a change event.
   */
  private _undoChange(change: IObservableList.IChangedArgs<T>): void {
    let index = 0;
    switch (change.type) {
    case 'add':
      each(change.newValues, () => {
        this.remove(change.newIndex);
      });
      break;
    case 'set':
      index = change.oldIndex;
      each(change.oldValues, value => {
        this.set(index++, value);
      });
      break;
    case 'remove':
      index = change.oldIndex;
      each(change.oldValues, value => {
        this.insert(index++, value);
      });
      break;
    case 'move':
      this.move(change.newIndex, change.oldIndex);
      break;
    default:
      return;
    }
  }

  /**
   * Redo a change event.
   */
  private _redoChange(change: IObservableList.IChangedArgs<T>): void {
    let index = 0;
    switch (change.type) {
    case 'add':
      index = change.newIndex;
      each(change.newValues, value => {
        this.insert(index++, value);
      });
      break;
    case 'set':
      index = change.newIndex;
      each(change.newValues, value => {
        this.set(change.newIndex++, value);
      });
      break;
    case 'remove':
      each(change.oldValues, () => {
        this.remove(change.oldIndex);
      });
      break;
    case 'move':
      this.move(change.oldIndex, change.newIndex);
      break;
    default:
      return;
    }
  }

  /**
   * Copy a change as JSON.
   */
  private _copyChange(change: IObservableList.IChangedArgs<T>): IObservableList.IChangedArgs<T> {
    let oldValues: T[] = [];
    each(change.oldValues, value => {
      oldValues.push(value);
    });
    let newValues: T[] = [];
    each(change.newValues, value => {
      newValues.push(value);
    });
    return {
      type: change.type,
      oldIndex: change.oldIndex,
      newIndex: change.newIndex,
      oldValues,
      newValues
    };
  }

  private _inCompound = false;
  private _isUndoable = true;
  private _madeCompoundChange = false;
  private _index = -1;
  private _stack: IObservableList.IChangedArgs<T>[][] = [];
}
