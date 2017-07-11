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
  ISettingRegistry, PathExt
} from '@jupyterlab/coreutils';

import {
  IDocumentManager
} from '@jupyterlab/docmanager';

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
  "jupyter.lab.setting-icon-class": "jp-GoogleDrive-logo",
  "jupyter.lab.setting-icon-label": "Google Drive",
  "title": "Google Drive",
  "description": "Settings for the Google Drive plugin.",
  "properties": {
    "clientId": {"type": "string", "title": "Client ID", "default": ''}
  },
  "type": "object"
};
/* tslint:enable */

const fileBrowserPlugin: JupyterLabPlugin<void> = {
  id: 'jupyter.extensions.google-drive',
  requires: [ICommandPalette, IDocumentManager, IFileBrowserFactory, ILayoutRestorer, ISettingRegistry],
  activate: activateFileBrowser,
  autoStart: true
};

/**
 * Activate the file browser.
 */
function activateFileBrowser(app: JupyterLab, palette: ICommandPalette, manager: IDocumentManager, factory: IFileBrowserFactory, restorer: ILayoutRestorer, settingRegistry: ISettingRegistry): void {
  let { commands } = app;
  const id = fileBrowserPlugin.id;

  // Load the gapi libraries onto the page.
  loadGapi();

  // Add the Google Drive backend to the contents manager.
  let drive = new GoogleDrive(app.docRegistry);
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
    drive.name, app.docRegistry, commands, manager, factory,
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
        let body = document.createElement('div');
        let text = document.createElement('p');
        text.textContent = 'Enter collaborator Gmail address. '+
                           'Multiple addresses may be separated by commas';
        let input = document.createElement('input');
        body.appendChild(text);
        body.appendChild(input);
        // Set 'multiple' and 'type=email' attributes,
        // which strips leading and trailing whitespace from
        // the email adresses.
        input.setAttribute('type', 'email');
        input.setAttribute('multiple', '');
        showDialog({
          title: `Share "${PathExt.basename(path)}"`,
          body,
          primaryElement: input,
          buttons: [Dialog.cancelButton(), Dialog.okButton({label: 'ADD'})]
        }).then( result=> {
          if (result.accept) {
            // Pick out the valid email addresses
            let candidateAddresses = input.value.split(',');
            let addresses: string[] = [];
            for (let address of candidateAddresses) {
              if (Private.isEmail(address)) {
               addresses.push(address);
              } else {
                console.warn(`${address} is not a valid email address`);
              }
            }
            // Get the file resource for the path and create
            // permissions for the valid email addresses.
            let localPath = path.split(':').pop();
            getResourceForPath(localPath).then((resource: any) => {
              for (let address of addresses) {
                createPermissions(resource.id, address);
              }
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

/**
 * A namespace for private data.
 */
namespace Private {
  /**
   * Return whether an email address is valid.
   * Uses a regexp given in the html spec here:
   * https://html.spec.whatwg.org/multipage/input.html#e-mail-state-(type=email)
   * 
   * #### Notes: this is not a perfect test, but it should be
   *   good enough for most use cases.
   *
   * @param email: the canditate email address.
   *
   * @returns a boolean for whether it is a valid email.
   */
  export function isEmail(email: string): boolean {
    let re = RegExp(/^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/);
    return re.test(email);
  }
}
