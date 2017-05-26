// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  each, map, toArray
} from '@phosphor/algorithm';

import {
  Widget, Menu, PanelLayout
} from '@phosphor/widgets';

import {
  CommandRegistry
} from '@phosphor/commands';

import {
  DisposableSet
} from '@phosphor/disposable';

import {
  showDialog, Dialog
} from '@jupyterlab/apputils';

import {
  IDocumentManager
} from '@jupyterlab/docmanager';

import {
  IDocumentRegistry
} from '@jupyterlab/docregistry';

import {
  FileBrowser, IFileBrowserFactory
} from '@jupyterlab/filebrowser';

import {
  getResourceForPath, createPermissions
} from './drive';

import {
  driveReady, authorize
} from '../gapi';


/**
 * Google Drive filebrowser plugin state namespace.
 */
export
const NAMESPACE = 'google-drive-filebrowser';

/**
 * CSS class for the filebrowser container.
 */
const GOOGLE_DRIVE_FILEBROWSER_CLASS = 'jp-GoogleDriveFileBrowser';

/**
 * CSS class for login panel.
 */
const LOGIN_SCREEN = 'jp-GoogleLoginScreen';

/**
 * Widget for hosting the Google Drive filebrowser.
 */
export
class GoogleDriveFileBrowser extends Widget {
  /**
   * Construct the browser widget.
   */
  constructor(registry: IDocumentRegistry, commands: CommandRegistry, manager: IDocumentManager, factory: IFileBrowserFactory, driveName: string) {
    super();
    this.addClass(GOOGLE_DRIVE_FILEBROWSER_CLASS);
    this.layout = new PanelLayout();

    // Initialize with the Login screen.
    this._loginScreen = new GoogleDriveLogin();
    (this.layout as PanelLayout).addWidget(this._loginScreen);

    // Keep references to the createFileBrowser arguments for
    // when we need to construct it.
    this._registry = registry;
    this._commands = commands;
    this._manager = manager;
    this._factory = factory;
    this._driveName = driveName;

    // After authorization and we are ready to use the
    // drive, swap out the widgets.
    driveReady.then(() => {
      this._browser = createFileBrowser(this._registry, this._commands,
                                        this._manager, this._factory,
                                        this._driveName);
      this._loginScreen.parent = null;
      (this.layout as PanelLayout).addWidget(this._browser);
    });

    this.title.label = 'Google Drive';
    this.id = 'google-drive-file-browser';
  }

  /**
   * Dispose of the resource held by the widget.
   */
  dispose(): void {
    let login = this._loginScreen;
    this._loginScreen = null;
    login.dispose();
    this._browser.dispose();
    this._browser = null;
    this._registry = null;
    this._commands = null;
    this._manager = null;
    this._factory = null;
    super.dispose();
  }

  private _browser: FileBrowser = null;
  private _loginScreen: GoogleDriveLogin = null;
  private _registry: IDocumentRegistry = null;
  private _commands: CommandRegistry = null;
  private _manager: IDocumentManager = null;
  private _factory: IFileBrowserFactory = null;
  private _driveName: string = null;
}

export
class GoogleDriveLogin extends Widget {
  /**
   * Construct the login panel.
   */
  constructor() {
    super();
    this.addClass(LOGIN_SCREEN);

    // Add the logo.
    let logo = document.createElement('div');
    logo.className = 'jp-GoogleDriveLogo';
    this.node.appendChild(logo);

    // Add the login button.
    this._button = document.createElement('button');
    this._button.title = 'Log into your Google account';
    this._button.textContent = 'LOG IN';
    this._button.className = 'jp-Dialog-button jp-mod-styled jp-mod-accept';
    this._button.onclick = this._onLoginClicked.bind(this);
    this.node.appendChild(this._button);
  }

  dispose(): void {
    this._button = null;
  }

  private _onLoginClicked(): void {
    authorize();
  }

  private _button: HTMLElement = null;
}



/**
 * Activate the file browser.
 */
function createFileBrowser(registry: IDocumentRegistry, commands: CommandRegistry, manager: IDocumentManager, factory: IFileBrowserFactory, driveName: string): FileBrowser {

  let fbWidget = factory.createFileBrowser(NAMESPACE, {
    commands,
    driveName: driveName
  });

  // Add a context menu to the dir listing.
  let node = fbWidget.node.getElementsByClassName('jp-DirListing-content')[0];
  node.addEventListener('contextmenu', (event: MouseEvent) => {
    event.preventDefault();
    let path = fbWidget.pathForClick(event) || '';
    let ext = '.' + path.split('.').pop();
    let factories = registry.preferredWidgetFactories(ext);
    let widgetNames = toArray(map(factories, factory => factory.name));
    let prefix = `google-drive-file-browser-contextmenu-${++Private.id}`;
    let openWith: Menu = null;
    if (path && widgetNames.length > 1) {
      let disposables = new DisposableSet();
      let command: string;

      openWith = new Menu({ commands });
      openWith.title.label = 'Open With...';
      openWith.disposed.connect(() => { disposables.dispose(); });

      for (let widgetName of widgetNames) {
        command = `${prefix}:${widgetName}`;
        disposables.add(commands.addCommand(command, {
          execute: () => fbWidget.openPath(path, widgetName),
          label: widgetName
        }));
        openWith.addItem({ command });
      }
    }

    let menu = createContextMenu(fbWidget, openWith);
    menu.open(event.clientX, event.clientY);
  });

  return fbWidget;
}

/**
 * Create a context menu for the file browser listing.
 */
function createContextMenu(fbWidget: FileBrowser, openWith: Menu):  Menu {
  let { commands } = fbWidget;
  let menu = new Menu({ commands });
  let prefix = `google-drive-file-browser-${++Private.id}`;
  let disposables = new DisposableSet();
  let command: string;

  // Remove all the commands associated with this menu upon disposal.
  menu.disposed.connect(() => { disposables.dispose(); });

  command = `${prefix}:open`;
  disposables.add(commands.addCommand(command, {
    execute: () => { fbWidget.open(); },
    icon: 'jp-MaterialIcon jp-OpenFolderIcon',
    label: 'Open',
    mnemonic: 0
  }));
  menu.addItem({ command });

  if (openWith) {
    menu.addItem({ type: 'submenu', submenu: openWith });
  }

  command = `${prefix}:rename`;
  disposables.add(commands.addCommand(command, {
    execute: () => fbWidget.rename(),
    icon: 'jp-MaterialIcon jp-EditIcon',
    label: 'Rename',
    mnemonic: 0
  }));
  menu.addItem({ command });

  command = `${prefix}:delete`;
  disposables.add(commands.addCommand(command, {
    execute: () => fbWidget.delete(),
    icon: 'jp-MaterialIcon jp-CloseIcon',
    label: 'Delete',
    mnemonic: 0
  }));
  menu.addItem({ command });

  command = `${prefix}:duplicate`;
  disposables.add(commands.addCommand(command, {
    execute: () => fbWidget.duplicate(),
    icon: 'jp-MaterialIcon jp-CopyIcon',
    label: 'Duplicate'
  }));
  menu.addItem({ command });

  command = `${prefix}:cut`;
  disposables.add(commands.addCommand(command, {
    execute: () => { fbWidget.cut(); },
    icon: 'jp-MaterialIcon jp-CutIcon',
    label: 'Cut'
  }));
  menu.addItem({ command });

  command = `${prefix}:copy`;
  disposables.add(commands.addCommand(command, {
    execute: () => { fbWidget.copy(); },
    icon: 'jp-MaterialIcon jp-CopyIcon',
    label: 'Copy',
    mnemonic: 0
  }));
  menu.addItem({ command });

  command = `${prefix}:paste`;
  disposables.add(commands.addCommand(command, {
    execute: () => fbWidget.paste(),
    icon: 'jp-MaterialIcon jp-PasteIcon',
    label: 'Paste',
    mnemonic: 0
  }));
  menu.addItem({ command });

  command = `${prefix}:download`;
  disposables.add(commands.addCommand(command, {
    execute: () => { fbWidget.download(); },
    icon: 'jp-MaterialIcon jp-DownloadIcon',
    label: 'Download'
  }));
  menu.addItem({ command });

  command = `${prefix}:shutdown`;
  disposables.add(commands.addCommand(command, {
    execute: () => fbWidget.shutdownKernels(),
    icon: 'jp-MaterialIcon jp-StopIcon',
    label: 'Shutdown Kernel'
  }));
  menu.addItem({ command });

  command = `${prefix}:share`;
  disposables.add(commands.addCommand(command, {
    execute: ()=> {
      let listing: any = (fbWidget as any)._listing;
      let model = fbWidget.model;
      let input = document.createElement('input');

      showDialog({
        title: 'Add collaborator Gmail address',
        body: input,
        buttons: [Dialog.cancelButton(), Dialog.okButton({label: 'ADD'})]
      }).then( result=> {
        if (result.accept) {
          each(model.items(), (item: any) => {
            if(listing.isSelected(item.name)) {
              let localPath = item.path.split(':').pop();
              getResourceForPath(localPath).then((resource) => {
                createPermissions(resource.id, input.value);
              });
            }
          });
        }
      });
    },
    icon: 'jp-MaterialIcon jp-CopyIcon',
    label: 'Share'
  }));
  menu.addItem({ command });

  menu.disposed.connect(() => { disposables.dispose(); });

  return menu;
}


/**
 * A namespace for private data.
 */
namespace Private {
  /**
   * The ID counter prefix for new commands.
   *
   * #### Notes
   * Even though the commands are disposed when the menus are disposed,
   * in order to guarantee there are no race conditions, each set of commands
   * is prefixed.
   */
  export
  let id = 0;
}
