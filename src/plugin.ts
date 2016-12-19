// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  Menu
} from 'phosphor/lib/ui/menu';

import {
  Widget
} from 'phosphor/lib/ui/widget';

import {
  JupyterLab, JupyterLabPlugin
} from 'jupyterlab/lib/application';

import {
  IMainMenu
} from 'jupyterlab/lib/mainmenu';

import {
  IRealtime, IRealtimeModel
} from 'jupyterlab/lib/realtime';

import {
  InstanceTracker
} from 'jupyterlab/lib/common/instancetracker';

import {
  showDialog, okButton
} from 'jupyterlab/lib/dialog';

import {
  GoogleRealtime
} from './googlerealtime';


let trackerSet = new Set<[InstanceTracker<Widget>, (widget: Widget)=>IRealtimeModel, (widget: Widget)=>void]>();

export
const plugin: JupyterLabPlugin<IRealtime> = {
  id: 'jupyter.services.realtime',
  requires: [IMainMenu],
  provides: IRealtime,
  activate: activateRealtime,
  autoStart: true
};

const cmdIds = {
  shareRealtimeFile : 'realtime:share',
  openRealtimeFile : 'realtime:open',
  openChatbox : 'chatbox:create-chatbox'
};

function activateRealtime(app: JupyterLab, mainMenu : IMainMenu): IRealtime {

  let realtime = new GoogleRealtime();

  mainMenu.addMenu(createMenu(app), {rank: 60});
  let commands = app.commands;

  commands.addCommand(cmdIds.shareRealtimeFile, {
    label: 'Share',
    caption: 'Share this file',
    execute: ()=> {
      let [widget, model, callback] = getRealtimeModel(app);
      if (model) {
        realtime.shareDocument(model)
        .then( ()=>{callback(widget);} );
      }
    }
  });
  commands.addCommand(cmdIds.openRealtimeFile, {
    label: 'Open',
    caption: 'Open a file that has been shared with you',
    execute: ()=> {
      let [widget, model, callback] = getRealtimeModel(app);
      if(model) {
        realtime.openSharedDocument(model)
        .then( ()=>{callback(widget);} );
      }
    }
  });

  return realtime;
}


function createMenu( app: JupyterLab ) : Menu {

  let {commands, keymap} = app;
  let menu = new Menu( {commands, keymap} )
  menu.title.label = 'Realtime'

  menu.addItem( {command: cmdIds.shareRealtimeFile});
  menu.addItem( {command: cmdIds.openRealtimeFile});
  menu.addItem( {command: cmdIds.openChatbox});

  return menu;
}

function getRealtimeModel( app: JupyterLab): [Widget, IRealtimeModel, (widget: Widget)=>void] {
  let model: IRealtimeModel = null;
  let callback: (widget: Widget)=>void = null;
  let widget = app.shell.currentWidget;
  trackerSet.forEach( ([tracker, getModel, cb]) => {
    if (tracker.has(widget)) {
      model = getModel(widget);
      callback = cb;
    }
  });
  return [widget, model, callback];
}

export
function addRealtimeTracker( tracker: InstanceTracker<Widget>, getModel : (widget: Widget)=>IRealtimeModel, callback: (widget: Widget)=>void = ()=>{} ): void {
  trackerSet.add([tracker, getModel, callback]);
}
