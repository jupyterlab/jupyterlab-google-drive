// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  IServiceManager
} from 'jupyterlab/lib/services';

import {
  JupyterLab, JupyterLabPlugin
} from 'jupyterlab/lib/application';

import {
  IDocumentManager
} from 'jupyterlab/lib/docmanager';

import {
  IDocumentRegistry
} from 'jupyterlab/lib/docregistry';

import {
  IRealtime
} from 'jupyterlab/lib/realtime';

import {
  IFileBrowserModel, IPathTracker, FileBrowser
} from 'jupyterlab/lib/filebrowser';

import {
  GoogleRealtime
} from './googlerealtime';

import {
  GoogleFileBrowserModel
} from './filebrowser';

const realtimePlugin: JupyterLabPlugin<IRealtime> = {
  id: 'jupyter.services.realtime',
  requires: [],
  provides: IRealtime,
  activate: activateRealtime,
  autoStart: true
};

const fileBrowserPlugin: JupyterLabPlugin<IPathTracker> = {
  id: 'jupyter.services.google-drive',
  requires: [IServiceManager, IDocumentManager, IDocumentRegistry],
  provides: IPathTracker,
  activate: activateFileBrowser,
  autoStart: true
};


function activateRealtime(app: JupyterLab): IRealtime {
  return new GoogleRealtime();
}

/**
 * Activate the file browser.
 */
function activateFileBrowser(app: JupyterLab, manager: IServiceManager, documentManager: IDocumentManager, registry: IDocumentRegistry): IPathTracker {
  let { commands, keymap } = app;
  let fbModel = new GoogleFileBrowserModel({manager});
  let fbWidget = new FileBrowser({
    commands: commands,
    keymap: keymap,
    manager: documentManager,
    model: fbModel
  });

  fbWidget.title.label = 'GDrive';
  fbWidget.id = 'google-drive-file-browser';
  app.shell.addToLeftArea(fbWidget, { rank: 50 });

  return fbModel;
}
/**
 * Export the plugins as default.
 */
const plugins: JupyterLabPlugin<any>[] = [realtimePlugin, fileBrowserPlugin];
export default plugins;
