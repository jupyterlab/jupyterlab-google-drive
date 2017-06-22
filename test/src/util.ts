// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  IModelDB
} from '@jupyterlab/coreutils';

import {
  PromiseDelegate
} from '@phosphor/coreutils';

/**
 * Class for an in memory `gapi.drive.realtime.Model`,
 * for use in testing without having to hit Google's servers.
 */
export
class inMemoryModel {
  constructor() {
    this._doc = gapi.drive.realtime.newInMemoryDocument();
    this._model = this._doc.getModel();
  }

  get model(): gapi.drive.realtime.Model {
    return this._model;
  }

  get doc(): gapi.drive.realtime.Document {
    return this._doc;
  }

  dispose(): void {
    let doc = this._doc;
    this._doc = null;
    this._model = null;

    doc.removeAllEventListeners();
    doc.close();
  }

  private _doc: gapi.drive.realtime.Document = null;
  private _model: gapi.drive.realtime.Model = null;
}

/**
 * Function to simulate the loading of a `gapi.drive.realtime.Document`
 * from a remote server.
 */
export
function documentLoader(path: string, connect: PromiseDelegate<void>) {
  return connect.promise.then(() => {
    let model = new inMemoryModel();
    return model.doc;
  });
}
