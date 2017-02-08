// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  IObservableMap, ObservableMap
} from 'jupyterlab/lib/common/observablemap';

import {
  IObservableString, ObservableString
} from 'jupyterlab/lib/common/observablestring';

import {
  IObservableVector, ObservableVector
} from 'jupyterlab/lib/common/observablevector';

import {
  IRealtime, IRealtimeHandler, IRealtimeModel,
  Synchronizable, ICollaborator
} from 'jupyterlab/lib/common/realtime';

import {
  GoogleRealtimeString
} from './realtimestring';

import {
  GoogleRealtimeVector
} from './realtimevector';

import {
  GoogleRealtimeMap
} from './realtimemap';

import {
  GoogleSynchronizable
} from './googlerealtime';

declare let gapi : any;

export
function linkMapItems(map: IObservableMap<Synchronizable>, gmap: GoogleRealtimeMap<Synchronizable>): void {
  let keys = map.keys();
  for(let key of keys) {
    let value: Synchronizable = map.get(key);
    let shadowValue: Synchronizable = gmap.get(key);
    if(value instanceof ObservableMap) {
      linkMapItems(value as IObservableMap<Synchronizable>, 
                         shadowValue as GoogleRealtimeMap<Synchronizable>);
      value.link(shadowValue as IObservableMap<Synchronizable>);
    } else if(value instanceof ObservableString) {
      value.link(shadowValue as IObservableString);
    } else if(value instanceof ObservableVector) {
      linkVectorItems(value as IObservableVector<Synchronizable>, 
                            shadowValue as GoogleRealtimeVector<Synchronizable>);
      value.link(shadowValue as IObservableVector<Synchronizable>);
    }
  }
}

export
function createMap(model: gapi.drive.realtime.Model, map: IObservableMap<Synchronizable>): GoogleRealtimeMap<Synchronizable> {
  let gmap = new GoogleRealtimeMap<Synchronizable>(map);
  gmap.googleObject = model.createMap<GoogleSynchronizable>();
  let keys = map.keys();
  for(let key of keys) {
    let value: Synchronizable = map.get(key);
    if(value instanceof ObservableMap) {
      let submap = createMap(model, value);
      gmap.linkSet(key, value, submap);
    } else if(value instanceof ObservableString) {
      let substring = createString(model, value);
      gmap.linkSet(key, value, substring);
    } else if(value instanceof ObservableVector) {
      let subvec = createVector(model, value);
      gmap.linkSet(key, value, subvec);
    } else {
      gmap.set(key, value);
    }
  }
  return gmap;
}

export
function createString(model: gapi.drive.realtime.Model, str: IObservableString): GoogleRealtimeString {
  let gstr = new GoogleRealtimeString();
  gstr.googleObject = model.createString(str.text);
  return gstr;
}

export
function linkString(str: IObservableString, gstr: GoogleRealtimeString): void {
  str.link(gstr);
}

export
function linkVectorItems(vec: IObservableVector<Synchronizable>, gvec: GoogleRealtimeVector<Synchronizable>): void {
  vec.clear();
  for(let i=0; i<gvec.length; i++) {
    let value: Synchronizable = gvec.at(i);
    vec.pushBack(value);
  }
}


export
function createVector<Synchronizable>(model: gapi.drive.realtime.Model, vec: IObservableVector<Synchronizable>): GoogleRealtimeVector<Synchronizable> {
  let gvec = new GoogleRealtimeVector<Synchronizable>(model, (vec as any)._factory);
  gvec.googleObject = model.createList<GoogleSynchronizable>();
  for(let i=0; i<vec.length; i++) {
    let value: Synchronizable = vec.at(i);
    if(value instanceof ObservableMap) {
      let submap = createMap(model, value);
      gvec.linkPush(value, submap);
    } else if(value instanceof ObservableString) {
      let substring = createString(model, value);
      gvec.linkPush(value, substring);
    } else if(value instanceof ObservableVector) {
      let subvec = createVector(model, value);
      gvec.linkPush(value, subvec);
    } else {
      gvec.set(i, value);
    }
  }
  return gvec;
}

/**
 * Take an item which is to be inserted into a collaborative
 * map or vector, and convert it into a form that the Google
 * Realtime API knows how to sync. In the case of primitives,
 * or things that are already JSONObjects, this means no change.
 */
export
function toGoogleSynchronizable(item: any): GoogleSynchronizable {
  if(!item) return item;
  if(item.isLinked && item._parent.googleObject) {
    return item._parent.googleObject;
  } else if (item.googleObject) {
    return item.googleObject;
  } else if (item.toJSON) {
    return item.toJSON();
  } else {
    return item;
  }
}

export
function fromGoogleSynchronizable(item: any, target?: any): Synchronizable {
  if(!item) return item;
  if(item.type && item.type === 'EditableString') {
    let str = new GoogleRealtimeString();
    str.googleObject = item;
    return str;
  } else if(item.type && item.type === 'List') {
    //let vec = new GoogleRealtimeVector<GoogleSynchronizable>();
    //vec.googleObject = item;
    //return vec;
  } else if(item.type && item.type === 'Map') {
    let map = new GoogleRealtimeMap<GoogleSynchronizable>(item);
    map.googleObject = item;
    return map;
  } else if( target && target.fromJSON) {
    target.fromJSON(item);
    return target;
  } else {
    return item as Synchronizable;
  }
}
