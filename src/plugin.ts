// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  each, map, toArray
} from '@phosphor/algorithm';

import {
  Menu
} from '@phosphor/widgets';

import {
  DisposableSet
} from '@phosphor/disposable';

import {
  IServiceManager
} from '@jupyterlab/services';

import {
  JupyterLab, JupyterLabPlugin
} from '@jupyterlab/application';

import {
  ICommandPalette, IStateDB
} from '@jupyterlab/apputils';

import {
  IDocumentManager, DocumentManager
} from '@jupyterlab/docmanager';

import {
  IDocumentRegistry
} from '@jupyterlab/docregistry';

import {
  IRealtime
} from '@jupyterlab/coreutils';

import {
  FileBrowserModel, IPathTracker, FileBrowser
} from '@jupyterlab/filebrowser';

import {
  GoogleRealtime
} from './realtime/googlerealtime';

import {
  getResourceForPath, createPermissions
} from './drive/drive';

import {
  GoogleDriveServiceManager
} from './drive/contents';

/**
 * Google Drive filebrowser plugin state namespace.
 */
const NAMESPACE = 'google-drive-filebrowser';

const realtimePlugin: JupyterLabPlugin<IRealtime> = {
  id: 'jupyter.services.realtime',
  requires: [ICommandPalette],
  provides: IRealtime,
  activate: activateRealtime,
  autoStart: true
};

const fileBrowserPlugin: JupyterLabPlugin<IPathTracker> = {
  id: 'jupyter.services.google-drive',
  requires: [IDocumentRegistry, IRealtime,  IStateDB],
  provides: IPathTracker,
  activate: activateFileBrowser,
  autoStart: true
};


function activateRealtime(app: JupyterLab, commandPalette: ICommandPalette): IRealtime {

  let realtimeServices = new GoogleRealtime();

  let commands = app.commands;
  let command = 'realtime:add-collaborator';
  commands.addCommand(command, {
    label: 'Share file',
    caption: 'Share this file',
    execute: ()=> {
    }
  });
  commandPalette.addItem({command, category: 'Realtime'});

  return realtimeServices;
}

/**
 * Activate the file browser.
 */
function activateFileBrowser(app: JupyterLab, registry: IDocumentRegistry, realtime: IRealtime, state: IStateDB): IPathTracker {
  let { commands } = app;
  let serviceManager = new GoogleDriveServiceManager(registry);

  let id = 1;
  let opener: DocumentManager.IWidgetOpener = {
    open: widget => {
      if (!widget.id) {
        widget.id = `google-drive-manager-${++id}`;
      }
      if (!widget.isAttached) {
        app.shell.addToMainArea(widget);
      }
      app.shell.activateById(widget.id);
    }
  };
  let documentManager = new DocumentManager({
    registry,
    manager: serviceManager,
    opener,
    realtimeServices: realtime
  });
  let fbModel = new FileBrowserModel({manager: serviceManager});
  let fbWidget = new FileBrowser({
    commands: commands,
    manager: documentManager,
    model: fbModel
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

      each(model.items(), (item: any) => {
        if(listing.isSelected(item.name)) {
          getResourceForPath(item.path).then((resource) => {
            createPermissions(resource.id, 'jupyter.realtime@gmail.com');
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
