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

const plugin: JupyterLabPlugin<IRealtime> = {
  id: 'jupyter.services.realtime',
  requires: [],
  provides: IRealtime,
  activate: activateRealtime,
  autoStart: true
};

function activateRealtime(app: JupyterLab): IRealtime {
  let realtime = new GoogleRealtime();
  return realtime;
}

export default plugin;
