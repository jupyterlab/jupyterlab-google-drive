// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  Signal, ISignal
} from '@phosphor/signaling';

import {
  IObservableString, ObservableString
} from '@jupyterlab/coreutils';

import {
  GoogleRealtimeObject
} from './googlerealtime';


/**
 * Realtime string which wraps `gapi.drive.realtime.CollaborativeString`.
 */
export
class GoogleString implements IObservableString, GoogleRealtimeObject {

  /**
   * Constructor for the string.
   */
  constructor (str: gapi.drive.realtime.CollaborativeString) {
    this.googleObject = str;
  }

  type: 'String';

  /**
   * Set the value of the string.
   */
  set text( value: string ) {
    if(this._str.length === value.length && this._str.getText() === value) {
      return;
    }
    this._str.setText(value);
    this._changed.emit({
      type: 'set',
      start: 0,
      end: value.length,
      value: value
    });
  }

  /**
   * Get the value of the string.
   */
  get text(): string {
    return this._str.getText();
  }

  /**
   * Get the underlying `gapi.drive.realtime.CollaborativeString`
   * for this string.
   */
  get googleObject(): gapi.drive.realtime.CollaborativeString {
    return this._str;
  }

  /**
   * Set the underlying `gapi.drive.realtime.CollaborativeString`
   * for this string.
   */
  set googleObject(str: gapi.drive.realtime.CollaborativeString) {
    let prevText = '';
    if(this._str) {
      prevText = this._str.getText();
      this._str.removeAllEventListeners();
    }

    // Set the new string.
    this._str = str;

    // Add event listeners to the CollaborativeString.
    this._str.addEventListener(
      gapi.drive.realtime.EventType.TEXT_INSERTED,
      (evt: any) => {
        if(!evt.isLocal) {
          this._changed.emit({
            type: 'insert',
            start: evt.index,
            end: evt.index + evt.text.length,
            value: evt.text
          });
        }
      });

    this._str.addEventListener(
      gapi.drive.realtime.EventType.TEXT_DELETED,
      (evt: any) => {
        if(!evt.isLocal) {
          this._changed.emit({
            type: 'remove',
            start: evt.index,
            end: evt.index + evt.text.length,
            value: evt.text
          });
        }
    });

    // Trigger text set event if necessary.
    if (prevText !== this._str.getText()) {
      this._changed.emit({
        type: 'set',
        start: 0,
        end: this._str.length,
        value: this._str.getText()
      });
    }
  }

  /**
   * A signal emitted when the string has changed.
   */
  get changed(): ISignal<IObservableString, ObservableString.IChangedArgs> {
    return this._changed;
  }


  /**
   * Insert a substring.
   *
   * @param index - The starting index.
   *
   * @param text - The substring to insert.
   */
  insert(index: number, text: string): void {
    this._str.insertString(index, text);
    this._changed.emit({
      type: 'insert',
      start: index,
      end: index + text.length,
      value: text
    });
  }

  /**
   * Remove a substring.
   *
   * @param start - The starting index.
   *
   * @param end - The ending index.
   */
  remove(start: number, end: number): void {
    let oldValue: string = this.text.slice(start, end);
    this._str.removeRange(start, end);
    this._changed.emit({
      type: 'remove',
      start: start,
      end: end,
      value: oldValue
    });
  }

  /**
   * Set the ObservableString to an empty string.
   */
  clear(): void {
    this.text = '';
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
    this._str.removeAllEventListeners();
    Signal.clearData(this);
    this._isDisposed = true;
  }

  private _changed = new Signal<IObservableString, ObservableString.IChangedArgs>(this);
  private _str: gapi.drive.realtime.CollaborativeString = null;
  private _isDisposed: boolean = false;
}
