// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  Widget, PanelLayout
} from '@phosphor/widgets';

import {
  CommandRegistry
} from '@phosphor/commands';

import {
  showDialog, Dialog, ToolbarButton
} from '@jupyterlab/apputils';

import {
  ISettingRegistry
} from '@jupyterlab/coreutils';

import {
  IDocumentManager
} from '@jupyterlab/docmanager';

import {
  DocumentRegistry
} from '@jupyterlab/docregistry';

import {
  FileBrowser, IFileBrowserFactory
} from '@jupyterlab/filebrowser';

import {
  gapiAuthorized, initializeGapi,
  signIn, signOut, getCurrentUserProfile
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
 * Class for a user badge UI button.
 */
const USER_BADGE = 'jp-GoogleUserBadge';

/**
 * Class for a container for the user badge.
 */
const USER_BADGE_CONTAINER = 'jp-GoogleUserBadge-container';

/**
 * Widget for hosting the Google Drive filebrowser.
 */
export
class GoogleDriveFileBrowser extends Widget {
  /**
   * Construct the browser widget.
   */
  constructor(driveName: string, registry: DocumentRegistry, commands: CommandRegistry, manager: IDocumentManager, factory: IFileBrowserFactory, settingsPromise: Promise<ISettingRegistry.ISettings>, hasOpenDocuments: () => boolean) {
    super();
    this.addClass(GOOGLE_DRIVE_FILEBROWSER_CLASS);
    this.layout = new PanelLayout();

    // Initialize with the Login screen.
    this._loginScreen = new GoogleDriveLogin(settingsPromise);
    (this.layout as PanelLayout).addWidget(this._loginScreen);

    this._hasOpenDocuments = hasOpenDocuments;

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
      this._createBrowser();
    });

    this.title.iconClass = 'jp-GoogleDrive-tablogo';
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
    this._hasOpenDocuments = null;
    super.dispose();
  }

  private _createBrowser(): void {
    // Create the file browser
    this._browser = this._factory.createFileBrowser(NAMESPACE, {
      commands: this._commands,
      driveName: this._driveName
    });

    // Create the logout button.
    let userProfile = getCurrentUserProfile();
    let initial = userProfile.getGivenName()[0];
    this._logoutButton = new ToolbarButton({
      onClick: () => {
        this._onLogoutClicked();
      },
      tooltip: `Sign Out (${userProfile.getEmail()})`
    });
    let badgeContainer = document.createElement('div');
    badgeContainer.className = USER_BADGE_CONTAINER;
    let badge = document.createElement('div');
    badge.className = USER_BADGE;
    badge.textContent = initial;
    badgeContainer.appendChild(badge);
    this._logoutButton.node.appendChild(badgeContainer);

    this._browser.toolbar.addItem('logout', this._logoutButton);
    this._loginScreen.parent = null;
    (this.layout as PanelLayout).addWidget(this._browser);
  }

  private _onLogoutClicked(): void {
    if (this._hasOpenDocuments()) {
      showDialog({
        title: 'Sign Out',
        body: 'Please close all documents in Google Drive before signing out',
        buttons: [Dialog.okButton({label: 'OK'})]
        });
      return;
    }

    // Swap out the file browser for the login screen.
    this._browser.parent = null;
    (this.layout as PanelLayout).addWidget(this._loginScreen);
    this._browser.dispose();
    this._logoutButton.dispose();

    // Sign out.
    signOut().then(() => {
      // After sign-out, set up a new listener
      // for authorization, should the user log
      // back in.
      gapiAuthorized.promise.then(() => {
        this._createBrowser();
      });
    });
  }

  private _browser: FileBrowser = null;
  private _loginScreen: GoogleDriveLogin = null;
  private _logoutButton: ToolbarButton = null;
  private _registry: DocumentRegistry = null;
  private _commands: CommandRegistry = null;
  private _manager: IDocumentManager = null;
  private _factory: IFileBrowserFactory = null;
  private _driveName: string = null;
  private _hasOpenDocuments: () => boolean = null;
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
    logo.className = 'jp-GoogleDrive-logo';
    this.node.appendChild(logo);

    // Add the text.
    let text = document.createElement('div');
    text.className = 'jp-GoogleDrive-text';
    text.textContent = 'Google Drive';
    this.node.appendChild(text);

    // Add the login button.
    this._button = document.createElement('button');
    this._button.title = 'Log into your Google account';
    this._button.textContent = 'SIGN IN';
    this._button.className = 'jp-Dialog-button jp-mod-styled jp-mod-accept';
    this._button.onclick = this._onLoginClicked.bind(this);
    this._button.style.visibility = 'hidden';
    this.node.appendChild(this._button);

    // Attempt to authorize on construction without using
    // a popup dialog. If the user is logged into the browser with
    // a Google account, this will likely succeed. Otherwise, they
    // will need to login explicitly.
    settingsPromise.then( settings => {
      this._clientId = settings.get('clientId').composite as string || null;
      initializeGapi(this._clientId).then(loggedIn => {
        if (!loggedIn) {
          this._button.style.visibility = 'visible';
        } else {
          gapiAuthorized.promise.then(() => {
            // Set the button style to visible in the
            // eventuality that the user logs out.
            this._button.style.visibility = 'visible';
          });
        }
      });
    });
  }

  /**
   * Handle a click of the login button.
   */
  private _onLoginClicked(): void {
    signIn();
  }

  private _button: HTMLElement = null;
  private _clientId: string;
}
