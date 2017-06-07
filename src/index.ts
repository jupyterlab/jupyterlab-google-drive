// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import '../style/index.css';

import {
  JupyterLab, JupyterLabPlugin
} from '@jupyterlab/application';

import {
  ILayoutRestorer, showDialog, Dialog, ICommandPalette
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

  // Add the Google Drive backend to the contents manager.
  let drive = new GoogleDrive(registry);
  manager.services.contents.addDrive(drive);

  // Add an annotation to the settings registry.
  settingRegistry.annotate(id, '', {
    label: 'Google Drive',
    iconLabel: 'Google Drive',
    iconClass: 'jp-GoogleDriveLogo'
  });
  settingRegistry.annotate(id, 'clientId', { label: 'Client ID' });

  // Create the file browser.
  let browser = new GoogleDriveFileBrowser(
    registry, commands, manager, factory, drive.name, settingRegistry.load(id));

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
