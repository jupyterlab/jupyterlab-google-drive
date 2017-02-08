// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ArrayIterator, IterableOrArrayLike,
  IIterator, each, toArray
} from 'phosphor/lib/algorithm/iteration';

import {
  JSONObject
} from 'phosphor/lib/algorithm/json';

import {
  indexOf
} from 'phosphor/lib/algorithm/searching';

import {
  clearSignalData, defineSignal, ISignal
} from 'phosphor/lib/core/signaling';

import {
  IObservableVector, ObservableVector
} from 'jupyterlab/lib/common/observablevector';

import {
  IObservableMap, ObservableMap
} from 'jupyterlab/lib/common/observablemap';

import {
  IObservableString, ObservableString
} from 'jupyterlab/lib/common/observablestring';

import {
  Synchronizable
} from 'jupyterlab/lib/common/realtime';

import {
  GoogleRealtimeMap
} from './realtimemap';

import {
  GoogleSynchronizable
} from './googlerealtime';

import {
  createVector, linkVectorItems, createMap,
  linkMapItems, createString, linkString,
  toGoogleSynchronizable, fromGoogleSynchronizable
} from './utils';

declare let gapi : any;


export
class GoogleRealtimeVector<Synchronizable> implements IObservableVector<Synchronizable> {

  constructor(model: gapi.drive.realtime.Model, factory: (value?: JSONObject)=>Synchronizable ) {
    this._factory = factory;
    this._gfactory = (val: Synchronizable): GoogleSynchronizable=>{
      let gval = createMap(model, val as any);
      (val as any).link(gval);
      return gval as any;
    };
  }

  get factory(): (value?: JSONObject)=>Synchronizable {
    return this._factory;
  }

  set googleObject(vec: gapi.drive.realtime.CollaborativeList<GoogleSynchronizable>) {
    //Create and populate the internal vectors
    this._vec = new ObservableVector<Synchronizable>();
    this._gvec = vec;
    
    let vals = this._gvec.asArray();
    for(let val of vals) {
      let parentVal: any = fromGoogleSynchronizable(val);
      let value = this._factory(this._JSONHack(parentVal));
      if(parentVal.has('outputs')) {
        (value as any).get('outputs').fromJSON(parentVal.get('outputs'));
        parentVal.set('outputs', (value as any).get('outputs'))
      }
      (value as any).link(parentVal);
      this._vec.pushBack(value);
    }

    //Add event listeners to the collaborativeVector
    this._gvec.addEventListener(
      gapi.drive.realtime.EventType.VALUES_ADDED,
      (evt : any) => {
        if(!evt.isLocal) {
          let vals: Synchronizable[] =
            this._fromGoogleSynchronizableArray(evt.values);
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
        if(!evt.isLocal) {
          let vals: Synchronizable[] =
            this._fromGoogleSynchronizableArray(evt.values);
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
        if(!evt.isLocal) {
          let oldVals: Synchronizable[] =
            this._fromGoogleSynchronizableArray(evt.oldValues);
          let newVals: Synchronizable[] =
            this._fromGoogleSynchronizableArray(evt.newValues);
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
  changed: ISignal<IObservableVector<Synchronizable>, ObservableVector.IChangedArgs<Synchronizable>>;

  /**
   * Whether this string is linkable.
   *
   * @returns `false'
   */
  readonly isLinkable: boolean = false;

  /**
   * Get whether this vector can is linked to another.
   *
   * @returns `false`.
   */
  readonly isLinked: boolean = false;

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
   * Link the vector to another vector.
   * Any changes to either are mirrored in the other.
   *
   * @param vec: the parent vector.
   */
  link(vec: IObservableVector<Synchronizable>): void {
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
  get front(): Synchronizable {
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
  get back(): Synchronizable {
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
  iter(): IIterator<Synchronizable> {
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
  at(index: number): Synchronizable {
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
  set(index: number, value: Synchronizable): void {
    let oldVal: Synchronizable = this._vec.at(index);

    this._vec.set(index, value);
    let gval = this._gfactory(value);
    this._gvec.set(index, toGoogleSynchronizable(gval));

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
  pushBack(value: Synchronizable): number {
    let len = this._vec.pushBack(value);
    let gval = this._gfactory(value);
    this._gvec.push(toGoogleSynchronizable(gval));

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
  popBack(): Synchronizable {
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
  insert(index: number, value: Synchronizable): number {
    this._vec.insert(index, value);
    let gval = this._gfactory(value);
    this._gvec.insert(index, toGoogleSynchronizable(gval));

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
  remove(value: Synchronizable): number {
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
  removeAt(index: number): Synchronizable {
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
    this._vec.move(fromIndex, toIndex);
    this._gvec.move(fromIndex, toIndex);
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
  pushAll(values: IterableOrArrayLike<Synchronizable>): number {
    let newIndex = this.length;
    let newValues = toArray(values);
    each(newValues, value => {
      this._vec.pushBack(value);
      let gval = this._gfactory(value);
      this._gvec.push(toGoogleSynchronizable(gval));
    });
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
  insertAll(index: number, values: IterableOrArrayLike<Synchronizable>): number {
    let newIndex = index;
    let newValues = toArray(values);
    let i = index;
    each(newValues, value => {
      this._vec.insert(i, value);
      let gval = this._gfactory(value);
      this._gvec.insert(i, toGoogleSynchronizable(gval));
      i++;
    });
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
    let oldValues: Synchronizable[] = [];
    for (let i = startIndex; i < endIndex; i++) {
      let val = this._vec.removeAt(startIndex);
      this._gvec.remove(startIndex);
      oldValues.push(val);
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

  linkPush(val: any, shadowVal: any): void {
    this._vec.pushBack(val as Synchronizable);
    this._gvec.push(toGoogleSynchronizable(shadowVal));
    val.link(shadowVal);
  }


  /**
   * Dispose of the resources held by the vector.
   */
  dispose(): void {
    if(this._isDisposed) {
      return;
    }
    clearSignalData(this);
    this._gvec.removeAllEventListeners();
    this._vec.dispose();
    this._isDisposed = true;
  }

  private _toGoogleSynchronizableArray( array: Synchronizable[] ): GoogleSynchronizable[] {
    let ret: GoogleSynchronizable[] = [];
    array.forEach( val => {
      ret.push(toGoogleSynchronizable(val));
    });
    return ret;
  }
  private _fromGoogleSynchronizableArray( array: GoogleSynchronizable[] ): Synchronizable[] {
    let ret: Synchronizable[] = [];
    array.forEach( val => {
      let parentVal = fromGoogleSynchronizable(val);
      let value = this._factory(this._JSONHack(parentVal));
      (value as any).link(parentVal);
      ret.push(value);
    });
    return ret;
  }

  private _JSONHack(parentVal: any): any {
    let cell: any = {
      cell_type: parentVal.get('cell_type'),
      outputs: [],
      executionCount: null,
      metadata: {},
      source: ''
    }
    return cell;
  }



  //which represents the canonical vector of objects.
  private _gvec : gapi.drive.realtime.CollaborativeList<GoogleSynchronizable> = null;
  //Canonical vector of objects.
  private _vec: ObservableVector<Synchronizable> = null;
  private _factory: (value?: JSONObject)=>Synchronizable;
  private _isDisposed : boolean = false;
  private _gfactory: (value: Synchronizable)=>GoogleSynchronizable;
}

// Define the signals for the Google realtime vector.
defineSignal(GoogleRealtimeVector.prototype, 'changed');
