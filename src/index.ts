// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import '../style/index.css';

import {
  Widget
} from '@phosphor/widgets';

import {
  ILayoutRestorer, JupyterLab, JupyterLabPlugin
} from '@jupyterlab/application';

import {
  showDialog, Dialog, ICommandPalette
} from '@jupyterlab/apputils';

import {
  ISettingRegistry
} from '@jupyterlab/coreutils';

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
  GoogleDriveFileBrowser, NAMESPACE
} from './drive/browser';

import {
  getResourceForPath, createPermissions
} from './drive/drive';

import {
  GoogleDrive
} from './drive/contents';

import {
  loadGapi
} from './gapi';

/* tslint:disable */
/**
 * The plugin setting schema.
 *
 * #### Notes
 * This will eventually reside in its own settings file.
 */
const schema = {
  "$schema": "http://json-schema.org/draft-06/schema",
  "jupyter.lab.setting-icon-class": "jp-GoogleDrive-logo",
  "jupyter.lab.setting-icon-label": "Google Drive",
  "title": "Google Drive",
  "description": "Settings for the Google Drive plugin.",
  "properties": {
    "clientId": {"type": "string", "title": "Client ID", "default": ''}
  }
};
/* tslint:enable */

const fileBrowserPlugin: JupyterLabPlugin<void> = {
  id: 'jupyter.extensions.google-drive',
  requires: [ICommandPalette, IDocumentManager, IDocumentRegistry, IFileBrowserFactory, ILayoutRestorer, ISettingRegistry],
  activate: activateFileBrowser,
  autoStart: true
};

/**
 * Activate the file browser.
 */
function activateFileBrowser(app: JupyterLab, palette: ICommandPalette, manager: IDocumentManager, registry: IDocumentRegistry, factory: IFileBrowserFactory, restorer: ILayoutRestorer, settingRegistry: ISettingRegistry): void {
  let { commands } = app;
  const id = fileBrowserPlugin.id;

  // Load the gapi libraries onto the page.
  loadGapi();

  // Add the Google Drive backend to the contents manager.
  let drive = new GoogleDrive(registry);
  manager.services.contents.addDrive(drive);

  // Preload the settings schema into the registry. This is deprecated.
  settingRegistry.preload(id, schema);

  // Construct a function that determines whether any documents
  // associated with this filebrowser are currently open.
  let hasOpenDocuments = () => {
    let iterator = app.shell.widgets('main');
    let widget: Widget;
    while (widget = iterator.next()) {
      let context = manager.contextForWidget(widget);
      if (context && context.path.split(':')[0] === drive.name) {
        return true;
      }
    }
    return false;
  }

  // Create the file browser.
  let browser = new GoogleDriveFileBrowser(
    drive.name, registry, commands, manager, factory,
    settingRegistry.load(id), hasOpenDocuments);

  // Add the file browser widget to the application restorer.
  restorer.add(browser, NAMESPACE);
  app.shell.addToLeftArea(browser, { rank: 101 });

  // Add the share command to the command registry.
  let command = `google-drive:share`;
  commands.addCommand(command, {
    execute: ()=> {
      const widget = app.shell.currentWidget;
      const context = manager.contextForWidget(widget);
      if (context) {
        let path = context.path;
        let input = document.createElement('input');
        showDialog({
          title: 'Add collaborator Gmail address',
          body: input,
          primaryElement: input,
          buttons: [Dialog.cancelButton(), Dialog.okButton({label: 'ADD'})]
        }).then( result=> {
          if (result.accept) {
            let localPath = path.split(':').pop();
            getResourceForPath(localPath).then((resource: any) => {
              createPermissions(resource.id, input.value);
            });
          }
        });
      }
    },
    icon: 'jp-MaterialIcon jp-ShareIcon',
    label: 'Share'
  });
  palette.addItem({ command, category: 'File Operations' });

  return;
}

/**
 * Export the plugin as default.
 */
export default fileBrowserPlugin;
