// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  IServiceManager
} from 'jupyterlab/lib/services';

import {
  JupyterLab, JupyterLabPlugin
} from 'jupyterlab/lib/application';

import {
  IDocumentManager, DocumentManager
} from 'jupyterlab/lib/docmanager';

import {
  IDocumentRegistry
} from 'jupyterlab/lib/docregistry';

import {
  IRealtime
} from 'jupyterlab/lib/realtime';

import {
  FileBrowserModel, IPathTracker, FileBrowser
} from 'jupyterlab/lib/filebrowser';

import {
  GoogleRealtime
} from './googlerealtime';

import {
  GoogleDriveServiceManager
} from './contents';

const realtimePlugin: JupyterLabPlugin<IRealtime> = {
  id: 'jupyter.services.realtime',
  requires: [],
  provides: IRealtime,
  activate: activateRealtime,
  autoStart: true
};

const fileBrowserPlugin: JupyterLabPlugin<IPathTracker> = {
  id: 'jupyter.services.google-drive',
  requires: [IDocumentRegistry],
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
function activateFileBrowser(app: JupyterLab, registry: IDocumentRegistry): IPathTracker {
  let { commands, keymap } = app;
  let serviceManager = new GoogleDriveServiceManager();

  let id = 1;
  let opener: DocumentManager.IWidgetOpener = {
    open: widget => {
      if (!widget.id) {
        widget.id = `google-drive-manager-${++id}`;
      }
      if (!widget.isAttached) {
        app.shell.addToMainArea(widget);
      }
      app.shell.activateMain(widget.id);
    }
  };
  let documentManager = new DocumentManager({ registry, manager: serviceManager, opener });
  let fbModel = new FileBrowserModel({manager: serviceManager});
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
