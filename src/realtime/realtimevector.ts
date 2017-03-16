// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  IterableOrArrayLike,
  IIterator, each, toArray, ArrayExt
} from '@phosphor/algorithm';

import {
  JSONObject
} from '@phosphor/coreutils';

import {
  Signal, ISignal
} from '@phosphor/signaling';

import {
  IObservableVector, ObservableVector
} from 'jupyterlab/lib/coreutils/observablevector';

import {
  IObservableMap, ObservableMap
} from 'jupyterlab/lib/coreutils/observablemap';

import {
  IObservableString, ObservableString
} from 'jupyterlab/lib/coreutils/observablestring';

import {
  Synchronizable
} from 'jupyterlab/lib/coreutils/realtime';

import {
  GoogleRealtimeMap
} from './realtimemap';

import {
  GoogleRealtimeString
} from './realtimestring';

import {
  GoogleSynchronizable, GoogleRealtimeObject
} from './googlerealtime';

declare let gapi : any;


export
class GoogleRealtimeVector<T> implements IObservableVector<T>, GoogleRealtimeObject {

  constructor(vector: gapi.drive.realtime.CollaborativeList<GoogleSynchronizable>, model: gapi.drive.realtime.Model) {
    this._model = model;

    //Create and populate the internal vectors
    this._vec = new ObservableVector<T>();
    this._gvec = vector;
    
    let vals = this._gvec.asArray();
    this._vec.pushAll(vals);

    //Add event listeners to the collaborativeVector
    this._gvec.addEventListener(
      gapi.drive.realtime.EventType.VALUES_ADDED,
      (evt : any) => {
        if(!evt.isLocal) {
          let vals: T[] =
            evt.values;
          this._vec.insertAll(evt.index, vals);
          this._changed.emit({
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
        if(!evt.isLocal) {
          let vals: T[] =
            evt.values;
          this._vec.removeRange(evt.index, evt.index+vals.length);
          this._changed.emit({
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
        if(!evt.isLocal) {
          let oldVals: T[] =
            evt.oldValues;
          let newVals: T[] =
            evt.newValues;
          for(let i=0; i<oldVals.length; i++) {
            this._vec.set(evt.index+i, newVals[i]);
          }

          this._changed.emit({
            type: 'set',
            oldIndex: evt.index,
            newIndex: evt.index,
            oldValues: oldVals,
            newValues: newVals
          });
        }
      });
  }

  type: 'Vector';

  /**
   * A signal emitted when the vector has changed.
   */
  get changed(): ISignal<IObservableVector<T>, ObservableVector.IChangedArgs<T>> {
    return this._changed;
  }

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
   * Get the underlying collaborative object
   * for this vector.
   */
  get googleObject(): gapi.drive.realtime.CollaborativeList<GoogleSynchronizable> {
    return this._gvec;
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
    let gval = value;
    this._gvec.set(index, gval);

    this._changed.emit({
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
    let gval = value;
    this._gvec.push(gval);

    this._changed.emit({
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

    this._changed.emit({
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
    let gval = value;
    this._gvec.insert(index, gval);

    this._changed.emit({
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
    let index = ArrayExt.firstIndexOf(toArray(this._vec), value);
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
    this._changed.emit({
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
    this._changed.emit({
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
    this._vec.move(fromIndex, toIndex);
    this._gvec.move(fromIndex, toIndex);
    this._changed.emit({
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
    each(newValues, value => {
      this._vec.pushBack(value);
      let gval = value;
      this._gvec.push(gval);
    });
    this._changed.emit({
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
    let i = index;
    each(newValues, value => {
      this._vec.insert(i, value);
      let gval = value;
      this._gvec.insert(i, gval);
      i++;
    });
    this._changed.emit({
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
      let val = this._vec.removeAt(startIndex);
      this._gvec.remove(startIndex);
      oldValues.push(val);
    }
    this._changed.emit({
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
   * Dispose of the resources held by the vector.
   */
  dispose(): void {
    if(this._isDisposed) {
      return;
    }
    Signal.clearData(this);
    this._gvec.removeAllEventListeners();
    this._vec.dispose();
    this._isDisposed = true;
  }

  //which represents the canonical vector of objects.
  private _gvec : gapi.drive.realtime.CollaborativeList<GoogleSynchronizable> = null;
  private _model: gapi.drive.realtime.Model = null;
  //Canonical vector of objects.
  private _vec: ObservableVector<T> = null;
  private _changed = new Signal<IObservableVector<T>, ObservableVector.IChangedArgs<T>>(this);
  private _isDisposed : boolean = false;
}
