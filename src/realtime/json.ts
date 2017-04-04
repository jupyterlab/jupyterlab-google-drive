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
   * Serialize the model to JSON.
   */
  toJSON(): JSONObject {
    let out: JSONObject = Object.create(null);
    for (let key of this.keys()) {
      let value = this.get(key);
      if (JSONExt.isPrimitive(value)) {
        out[key] = value;
      } else {
        out[key] = JSON.parse(JSON.stringify(value));
      }
    }
    return out;
  }
}
