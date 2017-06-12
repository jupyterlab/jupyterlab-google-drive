// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  Widget, PanelLayout
} from '@phosphor/widgets';

import {
  CommandRegistry
} from '@phosphor/commands';

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
  FileBrowser, IFileBrowserFactory
} from '@jupyterlab/filebrowser';

import {
  gapiAuthorized, initializeGapi, signIn
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
  constructor(registry: IDocumentRegistry, commands: CommandRegistry, manager: IDocumentManager, factory: IFileBrowserFactory, driveName: string, settingsPromise: Promise<ISettingRegistry.ISettings>) {
    super();
    this.addClass(GOOGLE_DRIVE_FILEBROWSER_CLASS);
    this.layout = new PanelLayout();

    // Initialize with the Login screen.
    this._loginScreen = new GoogleDriveLogin(settingsPromise);
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
    gapiAuthorized.promise.then(() => {
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
  constructor(settingsPromise: Promise<ISettingRegistry.ISettings>) {
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
    this._button.style.visibility = 'hidden';
    this.node.appendChild(this._button);

    // Attempt to authorize on construction without using
    // a popup dialog. If the user is logged into the browser with
    // a Google account, this will likely succeed. Otherwise, they
    // will need to login explicitly.
    settingsPromise.then( settings => {
      this._clientId = settings.get('clientId') as string || null;
      initializeGapi(this._clientId).then(loggedIn => {
        if (!loggedIn) {
          this._button.style.visibility = 'visible';
        }
      });
    });
  }

  dispose(): void {
    this._button = null;
  }

  private _onLoginClicked(): void {
    signIn();
  }

  private _button: HTMLElement = null;
  private _clientId: string;
}


/**
 * Activate the file browser.
 */
function createFileBrowser(registry: IDocumentRegistry, commands: CommandRegistry, manager: IDocumentManager, factory: IFileBrowserFactory, driveName: string): FileBrowser {

  let fbWidget = factory.createFileBrowser(NAMESPACE, {
    commands,
    driveName: driveName
  });

  return fbWidget;
}
