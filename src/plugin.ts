// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  JupyterLab, JupyterLabPlugin
} from 'jupyterlab/lib/application';

import {
  IRealtime
} from 'jupyterlab/lib/realtime';

import {
  GoogleRealtime
} from './googlerealtime';

const plugin: JupyterLabPlugin<IRealtime> = {
  id: 'jupyter.services.realtime',
  requires: [],
  provides: IRealtime,
  activate: activateRealtime,
  autoStart: true
};

function activateRealtime(app: JupyterLab): IRealtime {
  return new GoogleRealtime();
}

export default plugin;
