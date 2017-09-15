// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  JSONExt, JSONObject, JSONValue
} from '@phosphor/coreutils';

import {
  IObservableJSON
} from '@jupyterlab/coreutils';

import {
  GoogleMap
} from './map';


/**
 * A collaborative map for JSON data.
 */
export
class GoogleJSON extends GoogleMap<JSONValue> implements IObservableJSON {
  /**
   * Constructor for a collaborative JSON object.
   */
  constructor(map: gapi.drive.realtime.CollaborativeMap<JSONValue>) {
    super(map, JSONExt.deepEqual);
  }

  /**
   * Serialize the model to JSON.
   */
  toJSON(): JSONObject {
    const out: JSONObject = Object.create(null);
    for (let key of this.keys()) {
      const value = this.get(key);
      if (!value) {
        continue;
      }
      if (JSONExt.isPrimitive(value)) {
        out[key] = value;
      } else {
        out[key] = JSON.parse(JSON.stringify(value));
      }
    }
    return out;
  }
}
