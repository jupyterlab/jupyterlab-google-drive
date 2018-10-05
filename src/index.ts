// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import '../style/index.css';

import { Widget } from '@phosphor/widgets';

import { map, toArray } from '@phosphor/algorithm';

import {
  ILayoutRestorer,
  JupyterLab,
  JupyterLabPlugin
} from '@jupyterlab/application';

import { showDialog, Dialog, ICommandPalette } from '@jupyterlab/apputils';

import { ISettingRegistry, PathExt } from '@jupyterlab/coreutils';

import { IEditorServices } from '@jupyterlab/codeeditor';

import { IDocumentManager } from '@jupyterlab/docmanager';

import { DocumentRegistry, Context } from '@jupyterlab/docregistry';

import { IFileBrowserFactory } from '@jupyterlab/filebrowser';

import { IMainMenu } from '@jupyterlab/mainmenu';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { ChatboxPanel } from './chatbox';

import { GoogleDriveFileBrowser, NAMESPACE } from './drive/browser';

import { getResourceForPath, createPermissions } from './drive/drive';

import { GoogleDrive } from './drive/contents';

import { loadGapi } from './gapi';

/**
 * The command IDs used by the plugins.
 */
namespace CommandIDs {
  export const clear = 'chatbox:clear';

  export const run = 'chatbox:post';

  export const linebreak = 'chatbox:linebreak';

  export const shareCurrent = `google-drive:share-current`;

  export const shareBrowser = `google-drive:share-browser-item`;
}

/**
 * The JupyterLab plugin for the Google Drive Filebrowser.
 */
const fileBrowserPlugin: JupyterLabPlugin<void> = {
  id: '@jupyterlab/google-drive:drive',
  requires: [
    ICommandPalette,
    IDocumentManager,
    IFileBrowserFactory,
    ILayoutRestorer,
    IMainMenu,
    ISettingRegistry
  ],
  activate: activateFileBrowser,
  autoStart: true
};

/**
 * Activate the file browser.
 */
function activateFileBrowser(
  app: JupyterLab,
  palette: ICommandPalette,
  manager: IDocumentManager,
  factory: IFileBrowserFactory,
  restorer: ILayoutRestorer,
  mainMenu: IMainMenu,
  settingRegistry: ISettingRegistry
): void {
  const { commands } = app;
  const id = fileBrowserPlugin.id;

  // Load the gapi libraries onto the page.
  settingRegistry.load(id).then(settings => {
    const realtime = settings.get('realtime').composite as boolean;
    if (realtime === true) {
      console.warn(
        'Warning: Google Realtime has been deprecated. ' +
          'No new realtime applications may be registered, ' +
          'and existing ones will cease to work in December 2018'
      );
      loadGapi(true);
    } else {
      loadGapi(false);
    }
  });

  // Add the Google Drive backend to the contents manager.
  const drive = new GoogleDrive(app.docRegistry);
  manager.services.contents.addDrive(drive);

  // Construct a function that determines whether any documents
  // associated with this filebrowser are currently open.
  const hasOpenDocuments = () => {
    const iterator = app.shell.widgets('main');
    let widget = iterator.next();
    while (widget) {
      const context = manager.contextForWidget(widget);
      if (
        context &&
        manager.services.contents.driveName(context.path) === drive.name
      ) {
        return true;
      }
      widget = iterator.next();
    }
    return false;
  };

  // Create the file browser.
  const browser = new GoogleDriveFileBrowser(
    drive.name,
    app.docRegistry,
    commands,
    manager,
    factory,
    settingRegistry.load(id),
    hasOpenDocuments
  );

  browser.title.iconClass = 'jp-GoogleDrive-icon jp-SideBar-tabIcon';
  browser.title.caption = 'Google Drive';
  browser.id = 'google-drive-file-browser';

  // Add the file browser widget to the application restorer.
  restorer.add(browser, NAMESPACE);
  app.shell.addToLeftArea(browser, { rank: 101 });

  // Share files with another Google Drive user.
  const shareFiles = (paths: string[]): Promise<void> => {
    // Only share files in Google Drive.
    const toShare = paths.filter(path => {
      if (manager.services.contents.driveName(path) !== drive.name) {
        // Don't share if this file is not in the user's Google Drive.
        console.warn(`Cannot share ${path} outside of Google Drive`);
        return false;
      }
      return true;
    });
    if (toShare.length === 0) {
      return Promise.resolve(void 0);
    }

    // Otherwise open the sharing dialog and share the files.
    const name =
      toShare.length === 1 ? `"${PathExt.basename(toShare[0])}"` : 'files';
    return showDialog({
      title: `Share ${name}`,
      body: new Private.EmailAddressWidget(),
      focusNodeSelector: 'input',
      buttons: [Dialog.cancelButton(), Dialog.okButton({ label: 'SHARE' })]
    }).then(result => {
      if (result.button.accept) {
        return Promise.all(
          toShare.map(path => {
            // Get the file resource for the path and create
            // permissions for the valid email addresses.
            const addresses = result.value!;
            const localPath = manager.services.contents.localPath(path);
            return getResourceForPath(localPath!).then(resource => {
              createPermissions(resource, addresses);
            });
          })
        ).then(() => void 0);
      }
      return Promise.resolve(void 0);
    });
  };

  // Add the share-current command to the command registry.
  commands.addCommand(CommandIDs.shareCurrent, {
    execute: () => {
      const widget = app.shell.currentWidget;
      const context = widget ? manager.contextForWidget(widget) : undefined;
      if (context) {
        return shareFiles([context.path]);
      }
    },
    isEnabled: () => {
      const { currentWidget } = app.shell;
      if (!currentWidget) {
        return false;
      }
      const context = manager.contextForWidget(currentWidget);
      if (!context) {
        return false;
      }
      return manager.services.contents.driveName(context.path) === drive.name;
    },
    label: () => {
      const { currentWidget } = app.shell;
      let fileType = 'File';
      if (currentWidget) {
        const context = manager.contextForWidget(currentWidget);
        if (context) {
          const fts = app.docRegistry.getFileTypesForPath(context.path);
          if (fts.length && fts[0].displayName) {
            fileType = fts[0].displayName!;
          }
        }
      }
      return `Share ${fileType} with Google Drive…`;
    }
  });

  // Add the share-browser command to the command registry.
  commands.addCommand(CommandIDs.shareBrowser, {
    execute: () => {
      const browser = factory.tracker.currentWidget;
      if (!browser || browser.model.driveName !== drive.name) {
        return;
      }
      const paths = toArray(map(browser.selectedItems(), item => item.path));
      return shareFiles(paths);
    },
    iconClass: 'jp-MaterialIcon jp-GoogleDrive-icon',
    isEnabled: () => {
      const browser = factory.tracker.currentWidget;
      return !!browser && browser.model.driveName === drive.name;
    },
    label: 'Share with Google Drive…'
  });

  // matches only non-directory items in the Google Drive browser.
  const selector =
    '.jp-GoogleDriveFileBrowser .jp-DirListing-item[data-isdir="false"]';

  app.contextMenu.addItem({
    command: CommandIDs.shareBrowser,
    selector,
    rank: 100
  });

  palette.addItem({
    command: CommandIDs.shareCurrent,
    category: 'File Operations'
  });

  mainMenu.fileMenu.addGroup([{ command: CommandIDs.shareCurrent }], 20);

  return;
}

/**
 * The chatbox widget content factory.
 */
export const chatboxPlugin: JupyterLabPlugin<void> = {
  id: '@jupyterlab/google-drive:chatbox',
  requires: [
    ICommandPalette,
    IEditorServices,
    IDocumentManager,
    ILayoutRestorer,
    IRenderMimeRegistry,
    ISettingRegistry
  ],
  autoStart: true,
  activate: activateChatbox
};

/**
 * Activate the chatbox extension.
 */
async function activateChatbox(
  app: JupyterLab,
  palette: ICommandPalette,
  editorServices: IEditorServices,
  docManager: IDocumentManager,
  restorer: ILayoutRestorer,
  registry: IRenderMimeRegistry,
  settingRegistry: ISettingRegistry
): Promise<void> {
  const id = 'chatbox';
  const { commands, shell } = app;
  const category = 'Chatbox';
  let command: string;

  // Don't activate the chatbox if realtime is not enabled.
  const settings = await settingRegistry.load(fileBrowserPlugin.id);
  const realtime = settings.get('realtime').composite as boolean;
  if (!realtime) {
    return;
  }

  /**
   * Create a chatbox for a given path.
   */
  const editorFactory = editorServices.factoryService.newInlineEditor.bind(
    editorServices.factoryService
  );
  const contentFactory = new ChatboxPanel.ContentFactory({ editorFactory });
  const panel = new ChatboxPanel({
    rendermime: registry.clone(),
    contentFactory
  });

  // Add the chatbox panel to the tracker.
  panel.title.label = 'Chat';
  panel.id = id;

  restorer.add(panel, 'chatbox');

  command = CommandIDs.clear;
  commands.addCommand(command, {
    label: 'Clear Chat',
    execute: args => {
      panel.chatbox.clear();
    }
  });
  palette.addItem({ command, category });

  command = CommandIDs.run;
  commands.addCommand(command, {
    label: 'Post Chat Entry',
    execute: args => {
      panel.chatbox.post();
    }
  });
  palette.addItem({ command, category });

  command = CommandIDs.linebreak;
  commands.addCommand(command, {
    label: 'Insert Line Break',
    execute: args => {
      panel.chatbox.insertLinebreak();
    }
  });
  palette.addItem({ command, category });

  // Add keybindings to the chatbox
  commands.addKeyBinding({
    command: 'chatbox:post',
    selector: '.jp-Chatbox-prompt',
    keys: ['Enter']
  });
  commands.addKeyBinding({
    command: 'chatbox:linebreak',
    selector: '.jp-Chatbox-prompt',
    keys: ['Ctrl Enter']
  });

  /**
   * If the current collaborative context is closed,
   * we can search through the currently active documents
   * for another one. If none is found, remove the
   * chatbox widget.
   */
  const maybeFindCollaborativeContext = () => {
    const iterator = shell.widgets('main');
    let widget = iterator.next();
    while (widget) {
      // If the widget is a collaborative document,
      // reset the context and show the chatbox.
      const context = docManager.contextForWidget(widget);
      if (
        context &&
        !context.isDisposed &&
        context.model.modelDB.isCollaborative
      ) {
        if (!panel.isAttached) {
          shell.addToLeftArea(panel);
        }
        panel.context = context;
        context.disposed.connect(onContextDisposed);
        return;
      }
      widget = iterator.next();
    }
    panel.context = undefined;
    panel.parent = null;
  };

  /**
   * Handler for the disposal of one of our collaborative contexts.
   * If it is not the currently active one, do nothing. If it is,
   * we look for another one.
   */
  const onContextDisposed = (context: Context<DocumentRegistry.IModel>) => {
    if (panel.context !== context) {
      return;
    } else {
      maybeFindCollaborativeContext();
    }
  };

  /**
   * If there is a change in the active widget,
   * check if it has a collaborative context. If
   * so, set that to be the active chatbox context.
   */
  const onCurrentWidgetChanged = () => {
    const widget = shell.currentWidget;
    const context = widget ? docManager.contextForWidget(widget) : undefined;
    if (
      context &&
      !context.isDisposed &&
      context.model.modelDB.isCollaborative
    ) {
      // If the new widget is a collaborative document,
      // reset the context and show the chatbox.
      if (!panel.isAttached) {
        shell.addToLeftArea(panel);
      }
      panel.context = context;
      context.disposed.connect(onContextDisposed);
      return;
    }
  };

  app.restored.then(() => {
    onCurrentWidgetChanged();
  });
  shell.currentChanged.connect(onCurrentWidgetChanged);
}

/**
 * Export the plugins as default.
 */
const plugins: JupyterLabPlugin<any>[] = [fileBrowserPlugin, chatboxPlugin];
export default plugins;

/**
 * A namespace for private data.
 */
namespace Private {
  /**
   * A widget the reads and parses email addresses.
   */
  export class EmailAddressWidget extends Widget {
    /**
     * Construct a new EmailAddressWidget.
     */
    constructor() {
      super();
      const text = document.createElement('p');
      text.textContent =
        'Enter collaborator Gmail address. ' +
        'Multiple addresses may be separated by commas';
      this._inputNode = document.createElement('input');
      this.node.appendChild(text);
      this.node.appendChild(this._inputNode);
      // Set 'multiple' and 'type=email' attributes,
      // which strips leading and trailing whitespace from
      // the email adresses.
      this._inputNode.setAttribute('type', 'email');
      this._inputNode.setAttribute('multiple', '');
    }

    /**
     * Get the value for the widget.
     */
    getValue(): string[] {
      // Pick out the valid email addresses
      const candidateAddresses = this._inputNode.value.split(',');
      const addresses: string[] = [];
      for (let address of candidateAddresses) {
        if (isEmail(address)) {
          addresses.push(address);
        } else {
          console.warn(`"${address}" is not a valid email address`);
        }
      }
      return addresses;
    }

    private _inputNode: HTMLInputElement;
  }

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
  function isEmail(email: string): boolean {
    const re = RegExp(
      /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    );
    return re.test(email);
  }
}
