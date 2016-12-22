// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ArrayIterator, IterableOrArrayLike,
  IIterator, each, toArray
} from 'phosphor/lib/algorithm/iteration';

import {
  indexOf
} from 'phosphor/lib/algorithm/searching';

import {
  JSONObject
} from 'phosphor/lib/algorithm/json';

import {
  clearSignalData, defineSignal, ISignal
} from 'phosphor/lib/core/signaling';

import {
  IObservableVector, ObservableVector
} from 'jupyterlab/lib/common/observablevector';

import {
  IObservableUndoableVector,
} from 'jupyterlab/lib/notebook/common/undo';

import {
  ISynchronizable
} from 'jupyterlab/lib/realtime';

declare let gapi : any;


export
class GoogleRealtimeVector<T extends ISynchronizable<T>> implements IObservableUndoableVector<T> {

  constructor(factory: (value: JSONObject)=>T, model : any, id : string, initialValue?: IObservableVector<T>) {
    this._factory = factory;

    //Create and populate the internal vectors
    this._vec = new ObservableVector<T>();
    this._gvec = model.getRoot().get(id);
    if(!this._gvec) {
      //Does not exist, use initial values
      this._gvec = model.createList(this._toJSONArray(toArray(initialValue)));
      model.getRoot().set(id, this._gvec);
      for(let i=0; i < initialValue.length; i++) {
        let val: T = initialValue.at(i);
        this._connectToSync(val);
        this._vec.pushBack(val);
      }
    } else {
      //Already exists, populate with that.
      let vals = this._gvec.asArray();
      for(let i=0; i < this._gvec.length; i++) {
        this._vec.pushBack(this._createFromJSON(this._gvec.get(i)));
      }
    }

    //Add event listeners to the collaborativeVector
    this._gvec.addEventListener(
      gapi.drive.realtime.EventType.VALUES_ADDED,
      (evt : any) => {
        let vals: T[] = this._fromJSONArray(evt.values);
        if(!evt.isLocal) {
          this._vec.insertAll(evt.index, vals);

          this.changed.emit({
            type: 'add',
            oldIndex: -1,
            newIndex: evt.index,
            oldValues: [],
            newValues: vals
          });
        }
      });

    this._gvec.addEventListener(
      gapi.drive.realtime.EventType.VALUES_REMOVED,
      (evt : any) => {
        let vals: T[] = this._fromJSONArray(evt.values);
        if(!evt.isLocal) {
          this._vec.removeRange(evt.index, evt.index+vals.length);

          this.changed.emit({
            type: 'remove',
            oldIndex: evt.index,
            newIndex: -1,
            oldValues: vals,
            newValues: []
          });
        }
      });

    this._gvec.addEventListener(
      gapi.drive.realtime.EventType.VALUES_SET,
      (evt : any) => {
        let oldVals: T[] = this._fromJSONArray(evt.oldValues);
        let newVals: T[] = this._fromJSONArray(evt.newValues);
        if(!evt.isLocal) {
          for(let i=0; i<oldVals.length; i++) {
            this._vec.set(evt.index+i, newVals[i]);
          }

          this.changed.emit({
            type: 'set',
            oldIndex: evt.index,
            newIndex: evt.index,
            oldValues: oldVals,
            newValues: newVals
          });
        }
      });
  }

  /**
   * A signal emitted when the vector has changed.
   */
  changed: ISignal<IObservableVector<T>, ObservableVector.IChangedArgs<T>>;

  /**
   * Whether this string is linkable.
   *
   * @returns `false'
   */
  readonly isLinkable: boolean = false;

  /**
   * The length of the sequence.
   *
   * #### Notes
   * This is a read-only property.
   */
  get length(): number {
    return this._vec.length;
  }

  /**
   * Test whether the vector is empty.
   *
   * @returns `true` if the vector is empty, `false` otherwise.
   *
   * #### Complexity
   * Constant.
   *
   * #### Iterator Validity
   * No changes.
   */
  get isEmpty(): boolean {
    return this.length === 0;
  }

  /**
   * Whether the object can redo changes.
   */
  get canRedo(): boolean {
    return false;
  }

  /**
   * Whether the object can undo changes.
   */
  get canUndo(): boolean {
    return false;
  }

  /**
   * Get the factory object for deserialization.
   */
  get factory(): (value: JSONObject)=>T {
    return this._factory;
  }

  /**
   * Begin a compound operation.
   *
   * @param isUndoAble - Whether the operation is undoable.
   *   The default is `false`.
   */
  beginCompoundOperation(isUndoAble?: boolean): void {
    //no-op
  }

  /**
   * End a compound operation.
   */
  endCompoundOperation(): void {
    //no-op
  }

  /**
   * Undo an operation.
   */
  undo(): void {
    //no-op
  }

  /**
   * Redo an operation.
   */
  redo(): void {
    //no-op
  }

  /**
   * Clear the change stack.
   */
  clearUndo(): void {
    //no-op
  }

  /**
   * Link the vector to another vector.
   * Any changes to either are mirrored in the other.
   *
   * @param vec: the parent vector.
   */
  link(vec: IObservableVector<T>): void {
    //no-op
  }

  /**
   * Unlink the vector from its parent vector.
   */
  unlink(): void {
    //no-op
  }

  /**
   * Get the value at the front of the vector.
   *
   * @returns The value at the front of the vector, or `undefined` if
   *   the vector is empty.
   *
   * #### Complexity
   * Constant.
   *
   * #### Iterator Validity
   * No changes.
   */
  get front(): T {
    return this.at(0);
  }

  /**
   * Get the value at the back of the vector.
   *
   * @returns The value at the back of the vector, or `undefined` if
   *   the vector is empty.
   *
   * #### Complexity
   * Constant.
   *
   * #### Iterator Validity
   * No changes.
   */
  get back(): T {
    return this.at(this.length-1);
  }

  /**
   * Create an iterator over the values in the vector.
   *
   * @returns A new iterator starting at the front of the vector.
   *
   * #### Complexity
   * Constant.
   *
   * #### Iterator Validity
   * No changes.
   */
  iter(): IIterator<T> {
    return this._vec.iter();
  }

  /**
   * Get the value at the specified index.
   *
   * @param index - The positive integer index of interest.
   *
   * @returns The value at the specified index.
   *
   * #### Complexity
   * Constant.
   *
   * #### Iterator Validity
   * No changes.
   *
   * #### Undefined Behavior
   * An `index` which is non-integral or out of range.
   */
  at(index: number): T {
    return this._vec.at(index);
  }

  /**
   * Set the value at the specified index.
   *
   * @param index - The positive integer index of interest.
   *
   * @param value - The value to set at the specified index.
   *
   * #### Complexity
   * Constant.
   *
   * #### Iterator Validity
   * No changes.
   *
   * #### Undefined Behavior
   * An `index` which is non-integral or out of range.
   */
  set(index: number, value: T): void {
    let oldVal: T = this._vec.at(index);

    this._vec.set(index, value);
    this._gvec.set(index, value.toJSON());

    this.changed.emit({
      type: 'set',
      oldIndex: index,
      newIndex: index,
      oldValues: [oldVal],
      newValues: [value]
    });
  }

  /**
   * Add a value to the back of the vector.
   *
   * @param value - The value to add to the back of the vector.
   *
   * @returns The new length of the vector.
   *
   * #### Complexity
   * Constant.
   *
   * #### Iterator Validity
   * No changes.
   */
  pushBack(value: T): number {
    let len = this._vec.pushBack(value);
    this._connectToSync(value);
    this._gvec.push(value.toJSON());

    this.changed.emit({
      type: 'add',
      oldIndex: -1,
      newIndex: this.length - 1,
      oldValues: [],
      newValues: [value]
    });
    return len;
  }

  /**
   * Remove and return the value at the back of the vector.
   *
   * @returns The value at the back of the vector, or `undefined` if
   *   the vector is empty.
   *
   * #### Complexity
   * Constant.
   *
   * #### Iterator Validity
   * Iterators pointing at the removed value are invalidated.
   */
  popBack(): T {
    let last = this.length-1;
    let value = this.at(last);
    this._vec.removeAt(last);
    this._gvec.remove(last);

    this.changed.emit({
      type: 'remove',
      oldIndex: this.length,
      newIndex: -1,
      oldValues: [value],
      newValues: []
    });
    return value;
  }

  /**
   * Insert a value into the vector at a specific index.
   *
   * @param index - The index at which to insert the value.
   *
   * @param value - The value to set at the specified index.
   *
   * @returns The new length of the vector.
   *
   * #### Complexity
   * Linear.
   *
   * #### Iterator Validity
   * No changes.
   *
   * #### Notes
   * The `index` will be clamped to the bounds of the vector.
   *
   * #### Undefined Behavior
   * An `index` which is non-integral.
   */
  insert(index: number, value: T): number {
    this._vec.insert(index, value);
    this._gvec.insert(index, value.toJSON());
    this._connectToSync(value);
    this.changed.emit({
      type: 'add',
      oldIndex: -1,
      newIndex: index,
      oldValues: [],
      newValues: [value]
    });
    return this.length;
  }

  /**
   * Remove the first occurrence of a value from the vector.
   *
   * @param value - The value of interest.
   *
   * @returns The index of the removed value, or `-1` if the value
   *   is not contained in the vector.
   *
   * #### Complexity
   * Linear.
   *
   * #### Iterator Validity
   * Iterators pointing at the removed value and beyond are invalidated.
   *
   * #### Notes
   * Comparison is performed using strict `===` equality.
   */
  remove(value: T): number {
    let index = indexOf(this._vec, value);
    this.removeAt(index);
    return index;
  }

  /**
   * Remove and return the value at a specific index.
   *
   * @param index - The index of the value of interest.
   *
   * @returns The value at the specified index, or `undefined` if the
   *   index is out of range.
   *
   * #### Complexity
   * Constant.
   *
   * #### Iterator Validity
   * Iterators pointing at the removed value and beyond are invalidated.
   *
   * #### Undefined Behavior
   * An `index` which is non-integral.
   */
  removeAt(index: number): T {
    let value = this.at(index);
    this._vec.removeAt(index);
    this._gvec.remove(index);
    this.changed.emit({
      type: 'remove',
      oldIndex: index,
      newIndex: -1,
      oldValues: [value],
      newValues: []
    });
    return value;
  }

  /**
   * Remove all values from the vector.
   *
   * #### Complexity
   * Linear.
   *
   * #### Iterator Validity
   * All current iterators are invalidated.
   */
  clear(): void {
    let oldValues = toArray(this._vec);
    this._vec.clear();
    this._gvec.clear();
    this.changed.emit({
      type: 'remove',
      oldIndex: 0,
       newIndex: 0,
      oldValues,
      newValues: []
    });
  }

  /**
   * Move a value from one index to another.
   *
   * @parm fromIndex - The index of the element to move.
   *
   * @param toIndex - The index to move the element to.
   *
   * #### Complexity
   * Constant.
   *
   * #### Iterator Validity
   * Iterators pointing at the lesser of the `fromIndex` and the `toIndex`
   * and beyond are invalidated.
   *
   * #### Undefined Behavior
   * A `fromIndex` or a `toIndex` which is non-integral.
   */
  move(fromIndex: number, toIndex: number): void {
    let value = this.at(fromIndex);
    this.removeAt(fromIndex);
    if (toIndex < fromIndex) {
      this.insert(toIndex - 1, value);
    } else {
      this.insert(toIndex, value);
    }
    this.changed.emit({
      type: 'move',
      oldIndex: fromIndex,
      newIndex: toIndex,
      oldValues: [value],
      newValues: [value]
    });
  }

  /**
   * Push a set of values to the back of the vector.
   *
   * @param values - An iterable or array-like set of values to add.
   *
   * @returns The new length of the vector.
   *
   * #### Complexity
   * Linear.
   *
   * #### Iterator Validity
   * No changes.
   */
  pushAll(values: IterableOrArrayLike<T>): number {
    let newIndex = this.length;
    let newValues = toArray(values);
    each(newValues, value => { this.pushBack(value); });
    this.changed.emit({
      type: 'add',
      oldIndex: -1,
      newIndex,
      oldValues: [],
      newValues
    });
    return this.length;
  }

  /**
   * Insert a set of items into the vector at the specified index.
   *
   * @param index - The index at which to insert the values.
   *
   * @param values - The values to insert at the specified index.
   *
   * @returns The new length of the vector.
   *
   * #### Complexity.
   * Linear.
   *
   * #### Iterator Validity
   * No changes.
   *
   * #### Notes
   * The `index` will be clamped to the bounds of the vector.
   *
   * #### Undefined Behavior.
   * An `index` which is non-integral.
   */
  insertAll(index: number, values: IterableOrArrayLike<T>): number {
    let newIndex = index;
    let newValues = toArray(values);
    each(newValues, value => { this.insert(index++, value); });
    this.changed.emit({
      type: 'add',
      oldIndex: -1,
      newIndex,
      oldValues: [],
      newValues
    });
    return this.length;
  }

  /**
   * Remove a range of items from the vector.
   *
   * @param startIndex - The start index of the range to remove (inclusive).
   *
   * @param endIndex - The end index of the range to remove (exclusive).
   *
   * @returns The new length of the vector.
   *
   * #### Complexity
   * Linear.
   *
   * #### Iterator Validity
   * Iterators pointing to the first removed value and beyond are invalid.
   *
   * #### Undefined Behavior
   * A `startIndex` or `endIndex` which is non-integral.
   */
  removeRange(startIndex: number, endIndex: number): number {
    let oldValues: T[] = [];
    for (let i = startIndex; i < endIndex; i++) {
      oldValues.push(this.removeAt(startIndex));
    }
    this.changed.emit({
      type: 'remove',
      oldIndex: startIndex,
      newIndex: -1,
      oldValues,
      newValues: []
    });
    return this.length;
  }

  /**
   * Test whether the string has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose of the resources held by the string.
   */
  dispose(): void {
    if(this._isDisposed) {
      return;
    }
    this._gvec.removeAllEventListeners();
    this._vec.dispose();
    clearSignalData(this);
    this._isDisposed = true;
  }

  private _toJSONArray( array: T[] ): JSONObject[] {
    let ret: JSONObject[] = [];
    array.forEach( val => {
      ret.push(val.toJSON());
    });
    return ret;
  }
  private _fromJSONArray( array: JSONObject[] ): T[] {
    let ret: T[] = [];
    array.forEach( val => {
      ret.push(this._createFromJSON(val));
    });
    return ret;
  }

  private _connectToSync( value: T ): void {
    value.synchronizeRequest.connect( ()=>{
      let index = indexOf(this._vec, value);
      this._gvec.set(index, value.toJSON());
    });
  }

  private _createFromJSON (value: JSONObject): T {
    let val: T = this._factory(value);
    this._connectToSync(val);
    return val;
  }

  private _factory: (value: JSONObject) => T = null;
  private _model : gapi.drive.realtime.Model = null;
  //Google collaborativeList of JSONObjects that shadows the ObservableVector
  //which represents the canonical vector of objects.
  private _gvec : gapi.drive.realtime.CollaborativeList<JSONObject> = null;
  //Canonical vector of objects.
  private _vec: ObservableVector<T> = null;
  private _isDisposed : boolean = false;
}

// Define the signals for the Google realtime vector.
defineSignal(GoogleRealtimeVector.prototype, 'changed');
