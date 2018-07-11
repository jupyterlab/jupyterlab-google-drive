// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  IterableOrArrayLike,
  ArrayIterator,
  IIterator,
  each,
  toArray
} from '@phosphor/algorithm';

import { Signal, ISignal } from '@phosphor/signaling';

import { IObservableList } from '@jupyterlab/observables';

import { IGoogleRealtimeObject, GoogleSynchronizable } from './googlerealtime';

/**
 * Realtime list type wrapping `gapi.drive.realtme.CollaborativeList`.
 */
export class GoogleList<T extends GoogleSynchronizable>
  implements IObservableList<T>, IGoogleRealtimeObject {
  /**
   * Create a new GoogleList.
   */
  constructor(
    list: gapi.drive.realtime.CollaborativeList<T>,
    itemCmp?: (first: T, second: T) => boolean
  ) {
    this._itemCmp = itemCmp || Private.itemCmp;
    this.googleObject = list;
  }

  /**
   * The type of the Observable.
   */
  get type(): 'List' {
    return 'List';
  }

  /**
   * A signal emitted when the list has changed.
   */
  get changed(): ISignal<this, IObservableList.IChangedArgs<T>> {
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
   * Test whether the list is empty.
   *
   * @returns `true` if the list is empty, `false` otherwise.
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
   * Get the value at the front of the list.
   *
   * @returns The value at the front of the list, or `undefined` if
   *   the list is empty.
   *
   * #### Complexity
   * Constant.
   *
   * #### Iterator Validity
   * No changes.
   */
  get front(): T {
    return this.get(0);
  }

  /**
   * Get the value at the back of the list.
   *
   * @returns The value at the back of the list, or `undefined` if
   *   the list is empty.
   *
   * #### Complexity
   * Constant.
   *
   * #### Iterator Validity
   * No changes.
   */
  get back(): T {
    return this.get(this.length - 1);
  }

  /**
   * Get the underlying `gapi.drive.CollaborativeList`
   * for this list.
   */
  get googleObject(): gapi.drive.realtime.CollaborativeList<T> {
    return this._vec;
  }

  /**
   * Set the underlying `gapi.drive.CollaborativeList` for this
   * list.
   */
  set googleObject(vec: gapi.drive.realtime.CollaborativeList<T>) {
    // First, recreate the new list using the old list
    // to send the appropriate signals.
    if (this._vec) {
      this.clear();
      this.pushAll(vec.asArray());
      this._vec.removeAllEventListeners();
    }

    // Set the new list.
    this._vec = vec;

    // Add event listeners to the new CollaborativeList.
    this._vec.addEventListener(
      gapi.drive.realtime.EventType.VALUES_ADDED,
      (evt: any) => {
        if (!evt.isLocal) {
          const vals: T[] = evt.values;
          this._changed.emit({
            type: 'add',
            oldIndex: -1,
            newIndex: evt.index,
            oldValues: [],
            newValues: vals
          });
        }
      }
    );

    this._vec.addEventListener(
      gapi.drive.realtime.EventType.VALUES_REMOVED,
      (evt: any) => {
        if (!evt.isLocal) {
          const vals: T[] = evt.values;
          this._changed.emit({
            type: 'remove',
            oldIndex: evt.index,
            newIndex: -1,
            oldValues: vals,
            newValues: []
          });
        }
      }
    );

    this._vec.addEventListener(
      gapi.drive.realtime.EventType.VALUES_SET,
      (evt: any) => {
        if (!evt.isLocal) {
          const oldVals: T[] = evt.oldValues;
          const newVals: T[] = evt.newValues;

          this._changed.emit({
            type: 'set',
            oldIndex: evt.index,
            newIndex: evt.index,
            oldValues: oldVals,
            newValues: newVals
          });
        }
      }
    );
  }

  /**
   * Create an iterator over the values in the list.
   *
   * @returns A new iterator starting at the front of the list.
   *
   * #### Complexity
   * Constant.
   *
   * #### Iterator Validity
   * No changes.
   */
  iter(): IIterator<T> {
    return new ArrayIterator<T>(this._vec.asArray());
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
  get(index: number): T {
    return this._vec.get(index);
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
    const oldVal: T = this._vec.get(index);
    // Bail if the value does not change.
    if (this._itemCmp(oldVal, value)) {
      return;
    }
    this._vec.set(index, value);

    this._changed.emit({
      type: 'set',
      oldIndex: index,
      newIndex: index,
      oldValues: [oldVal],
      newValues: [value]
    });
  }

  /**
   * Add a value to the back of the list.
   *
   * @param value - The value to add to the back of the list.
   *
   * @returns The new length of the list.
   *
   * #### Complexity
   * Constant.
   *
   * #### Iterator Validity
   * No changes.
   */
  push(value: T): number {
    const len = this._vec.push(value);

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
   * Remove and return the value at the back of the list.
   *
   * @returns The value at the back of the list, or `undefined` if
   *   the list is empty.
   *
   * #### Complexity
   * Constant.
   *
   * #### Iterator Validity
   * Iterators pointing at the removed value are invalidated.
   */
  popBack(): T {
    const last = this.length - 1;
    const value = this.get(last);
    this._vec.remove(last);

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
   * Insert a value into the list at a specific index.
   *
   * @param index - The index at which to insert the value.
   *
   * @param value - The value to set at the specified index.
   *
   * @returns The new length of the list.
   *
   * #### Complexity
   * Linear.
   *
   * #### Iterator Validity
   * No changes.
   *
   * #### Notes
   * The `index` will be clamped to the bounds of the list.
   *
   * #### Undefined Behavior
   * An `index` which is non-integral.
   */
  insert(index: number, value: T): number {
    this._vec.insert(index, value);

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
   * Remove the first occurrence of a value from the list.
   *
   * @param value - The value of interest.
   *
   * @returns The index of the removed value, or `-1` if the value
   *   is not contained in the list.
   *
   * #### Complexity
   * Linear.
   *
   * #### Iterator Validity
   * Iterators pointing at the removed value and beyond are invalidated.
   *
   * #### Notes
   * Comparison is performed according to the itemCmp function,
   * which defaults to strict `===` equality.
   */
  removeValue(value: T): number {
    const index = this._vec.indexOf(value, this._itemCmp);
    if (index === -1) {
      return index;
    }
    this.remove(index);
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
  remove(index: number): T | undefined {
    if (index < 0 || index >= this.length) {
      return undefined;
    }
    const value = this.get(index);
    this._vec.remove(index);
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
   * Remove all values from the list.
   *
   * #### Complexity
   * Linear.
   *
   * #### Iterator Validity
   * All current iterators are invalidated.
   */
  clear(): void {
    if (this.length === 0) {
      return;
    }
    const oldValues = this._vec.asArray();
    this._vec.clear();
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
    if (this.length === 1 || fromIndex === toIndex) {
      return;
    }
    const value = this.get(fromIndex);
    // WARNING: the Google CollaborativeList object
    // has different move semantics than what we expect
    // here (see Google Realtime API docs). Hence we have
    // to do some strange indexing to get the intended behavior.
    if (fromIndex < toIndex) {
      this._vec.move(fromIndex, toIndex + 1);
    } else {
      this._vec.move(fromIndex, toIndex);
    }
    this._changed.emit({
      type: 'move',
      oldIndex: fromIndex,
      newIndex: toIndex,
      oldValues: [value],
      newValues: [value]
    });
  }

  /**
   * Push a set of values to the back of the list.
   *
   * @param values - An iterable or array-like set of values to add.
   *
   * @returns The new length of the list.
   *
   * #### Complexity
   * Linear.
   *
   * #### Iterator Validity
   * No changes.
   */
  pushAll(values: IterableOrArrayLike<T>): number {
    const newIndex = this.length;
    const newValues = toArray(values);
    each(newValues, value => {
      this._vec.push(value);
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
   * Insert a set of items into the list at the specified index.
   *
   * @param index - The index at which to insert the values.
   *
   * @param values - The values to insert at the specified index.
   *
   * @returns The new length of the list.
   *
   * #### Complexity.
   * Linear.
   *
   * #### Iterator Validity
   * No changes.
   *
   * #### Notes
   * The `index` will be clamped to the bounds of the list.
   *
   * #### Undefined Behavior.
   * An `index` which is non-integral.
   */
  insertAll(index: number, values: IterableOrArrayLike<T>): number {
    const newIndex = index;
    const newValues = toArray(values);
    let i = index;
    each(newValues, value => {
      this._vec.insert(i, value);
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
   * Remove a range of items from the list.
   *
   * @param startIndex - The start index of the range to remove (inclusive).
   *
   * @param endIndex - The end index of the range to remove (exclusive).
   *
   * @returns The new length of the list.
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
    const oldValues: T[] = [];
    for (let i = startIndex; i < endIndex; i++) {
      const val = this._vec.get(startIndex);
      this._vec.remove(startIndex);
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
   * Dispose of the resources held by the list.
   */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    Signal.clearData(this);
    this._vec.removeAllEventListeners();
  }

  private _vec: gapi.drive.realtime.CollaborativeList<T>;
  private _changed = new Signal<this, IObservableList.IChangedArgs<T>>(this);
  private _itemCmp: (first: T, second: T) => boolean;
  private _isDisposed: boolean = false;
}

/**
 * The namespace for module private data.
 */
namespace Private {
  /**
   * The default strict equality item cmp.
   */
  export function itemCmp(first: any, second: any): boolean {
    return first === second;
  }
}
