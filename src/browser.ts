// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Widget, PanelLayout } from '@lumino/widgets';

import { CommandRegistry } from '@lumino/commands';

import { showDialog, Dialog, ToolbarButton } from '@jupyterlab/apputils';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { IDocumentManager } from '@jupyterlab/docmanager';

import { DocumentRegistry } from '@jupyterlab/docregistry';

import { FileBrowser, IFileBrowserFactory } from '@jupyterlab/filebrowser';

import {
  gapiAuthorized,
  initializeGapi,
  signIn,
  signOut,
  getCurrentUserProfile
} from './gapi';

/**
 * Google Drive filebrowser plugin state namespace.
 */
export const NAMESPACE = 'google-drive-filebrowser';

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
export class GoogleDriveFileBrowser extends Widget {
  /**
   * Construct the browser widget.
   */
  constructor(
    driveName: string,
    registry: DocumentRegistry,
    commands: CommandRegistry,
    manager: IDocumentManager,
    factory: IFileBrowserFactory,
    settingsPromise: Promise<ISettingRegistry.ISettings>,
    hasOpenDocuments: () => boolean
  ) {
    super();
    this.addClass(GOOGLE_DRIVE_FILEBROWSER_CLASS);
    this.layout = new PanelLayout();

    // Initialize with the Login screen.
    this._loginScreen = new GoogleDriveLogin(settingsPromise);
    (this.layout as PanelLayout).addWidget(this._loginScreen);

    this._hasOpenDocuments = hasOpenDocuments;

    // Keep references to the createFileBrowser arguments for
    // when we need to construct it.
    this._factory = factory;
    this._driveName = driveName;

    // After authorization and we are ready to use the
    // drive, swap out the widgets.
    gapiAuthorized.promise.then(() => {
      this._createBrowser();
    });
  }

  /**
   * Whether the widget has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose of the resource held by the widget.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._loginScreen.dispose();
    this._browser.dispose();
    super.dispose();
  }

  private _createBrowser(): void {
    // Create the file browser
    this._browser = this._factory.createFileBrowser(NAMESPACE, {
      driveName: this._driveName
    });

    // Create the logout button.
    const userProfile = getCurrentUserProfile();
    this._logoutButton = new ToolbarButton({
      onClick: () => {
        this._onLogoutClicked();
      },
      tooltip: `Sign Out (${userProfile.getEmail()})`,
      iconClass: 'jp-GoogleUserBadge jp-Icon jp-Icon-16'
    });

    this._browser.toolbar.addItem('logout', this._logoutButton);
    this._loginScreen.parent = null;
    (this.layout as PanelLayout).addWidget(this._browser);
  }

  private _onLogoutClicked(): void {
    if (this._hasOpenDocuments()) {
      showDialog({
        title: 'Sign Out',
        body: 'Please close all documents in Google Drive before signing out',
        buttons: [Dialog.okButton({ label: 'OK' })]
      });
      return;
    }

    // Change to the root directory, so an invalid path
    // is not cached, then sign out.
    this._browser.model.cd('/').then(async () => {
      // Swap out the file browser for the login screen.
      this._browser.parent = null;
      (this.layout as PanelLayout).addWidget(this._loginScreen);
      this._browser.dispose();
      this._logoutButton.dispose();

      // Do the actual sign-out.
      await signOut();
      // After sign-out, set up a new listener
      // for authorization, should the user log
      // back in.
      await gapiAuthorized.promise;
      this._createBrowser();
    });
  }

  private _isDisposed = false;
  private _browser: FileBrowser;
  private _loginScreen: GoogleDriveLogin;
  private _logoutButton: ToolbarButton;
  private _factory: IFileBrowserFactory;
  private _driveName: string;
  private _hasOpenDocuments: () => boolean;
}

export class GoogleDriveLogin extends Widget {
  /**
   * Construct the login panel.
   */
  constructor(settingsPromise: Promise<ISettingRegistry.ISettings>) {
    super();
    this.addClass(LOGIN_SCREEN);

    // Add the logo.
    const logo = document.createElement('div');
    logo.className = 'jp-GoogleDrive-logo';
    this.node.appendChild(logo);

    // Add the text.
    const text = document.createElement('div');
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
    settingsPromise.then(async settings => {
      this._clientId = settings.get('clientId').composite as string;
      if (!this._clientId) {
        console.warn(
          'Warning: no Client ID found. The Google Drive plugin will not work until the Client ID has been set, and the page refreshed.'
        );
        return;
      }
      try {
        const loggedIn = await initializeGapi(this._clientId);
        if (!loggedIn) {
          this._button.style.visibility = 'visible';
        } else {
          await gapiAuthorized.promise;
          // Set the button style to visible in the
          // eventuality that the user logs out.
          this._button.style.visibility = 'visible';
        }
      } catch (err) {
        showDialog({
          title: 'Google API Error',
          body: err,
          buttons: [Dialog.okButton({ label: 'OK' })]
        });
      }
    });
  }

  /**
   * Handle a click of the login button.
   */
  private _onLoginClicked(): void {
    signIn();
  }

  private _button: HTMLElement;
  private _clientId: string;
}
