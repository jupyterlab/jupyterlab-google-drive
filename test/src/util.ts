// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  IModelDB, uuid
} from '@jupyterlab/coreutils';

import {
  TextModelFactory, DocumentRegistry, Context
} from '@jupyterlab/docregistry';

import {
  IRenderMime, RenderMime, RenderedHTML, defaultRendererFactories
} from '@jupyterlab/rendermime';

import {
  ServiceManager
} from '@jupyterlab/services';

import {
  PromiseDelegate
} from '@phosphor/coreutils';

import {
  gapiAuthorized
} from '../../lib/gapi';

/**
 * Get a copy of the default rendermime instance.
 */
export
function defaultRenderMime(): RenderMime {
  return Private.rendermime.clone();
}

/**
 * Create a context for a file.
 */
export
function createFileContext(path?: string, manager?: ServiceManager.IManager): Context<DocumentRegistry.IModel> {
  manager = manager || Private.manager;
  let factory = Private.textFactory;
  path = path || uuid() + '.txt';
  return new Context({ manager, factory, path });
}

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


/**
 * Function to load and authorize gapi with a test account.
 */
export
function authorizeGapiTesting(): Promise<void> {
  const CLIENT_ID = '<TEST_CLIENT_ID>';
  const ACCESS_TOKEN = '<TEST_ACCESS_TOKEN>';
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
  const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];

  return new Promise<void>(resolve => {
    gapi.client.init({
      discoveryDocs: DISCOVERY_DOCS,
      clientId: CLIENT_ID,
      scope: DRIVE_SCOPE
    }).then(() => {
      (gapi.client as any).setToken({
        access_token: ACCESS_TOKEN
      });
      gapiAuthorized.resolve(void 0);
      resolve(void 0);
    }).catch(err => {
      console.error(err);
    });
  });
}

/**
 * A namespace for private data.
 */
namespace Private {
  export
  const manager = new ServiceManager();

  export
  const textFactory = new TextModelFactory();

  export
  const rendermime = new RenderMime({
    initialFactories: defaultRendererFactories
  });
}
