// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  JupyterLab, JupyterLabPlugin
} from '@jupyterlab/application';

import {
  ILayoutRestorer
} from '@jupyterlab/apputils';

import {
  IDocumentManager
} from '@jupyterlab/docmanager';

import {
  IDocumentRegistry
} from '@jupyterlab/docregistry';

import {
  IFileBrowserFactory
} from '@jupyterlab/filebrowser';

import {
  createFileBrowser, NAMESPACE
} from './drive/browser';

import {
  GoogleDrive
} from './drive/contents';


const fileBrowserPlugin: JupyterLabPlugin<void> = {
  id: 'jupyter.extensions.google-drive',
  requires: [IDocumentManager, IDocumentRegistry, IFileBrowserFactory, ILayoutRestorer],
  activate: activateFileBrowser,
  autoStart: true
};

/**
 * Activate the file browser.
 */
function activateFileBrowser(app: JupyterLab, manager: IDocumentManager, registry: IDocumentRegistry, factory: IFileBrowserFactory, restorer: ILayoutRestorer): void {
  let { commands } = app;

  let drive = new GoogleDrive(registry);
  manager.services.contents.addDrive(drive);

  let fbWidget = createFileBrowser(registry, commands, manager, factory, drive.name);

  // Add the file browser widget to the application restorer
  restorer.add(fbWidget, NAMESPACE);
  app.shell.addToLeftArea(fbWidget, { rank: 50 });

  return;
}

/**
 * Export the plugin as default.
 */
export default fileBrowserPlugin;
