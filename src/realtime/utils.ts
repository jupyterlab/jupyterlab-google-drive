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
  Synchronizable, ICollaborator, IRealtimeConverter
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
      value.link(shadowValue as GoogleRealtimeVector<Synchronizable>);
    }
  }
}

export
function createMap(map: IObservableMap<Synchronizable>, model: gapi.drive.realtime.Model): GoogleRealtimeMap<Synchronizable> {
  let googleObject = model.createMap<GoogleSynchronizable>();
  let gmap = new GoogleRealtimeMap<Synchronizable>(
    googleObject, model, map.converters);
  let keys = map.keys();
  for(let key of keys) {
    let value: Synchronizable = map.get(key);
    let gvalue: any;
    if(map.converters.has(key)) {
      gvalue = map.converters.get(key).to(value);
    } else {
      gvalue = value;
    }
    if(gvalue instanceof ObservableMap) {
      let submap = createMap(gvalue, model);
      gvalue.link(submap);
      gmap.linkSet(key, value, submap);
    } else if(gvalue instanceof ObservableString) {
      let substring = createString(gvalue, model);
      gvalue.link(substring);
      gmap.linkSet(key, value, substring);
    } else if(gvalue instanceof ObservableVector) {
      let subvec = createVector(gvalue, model);
      gvalue.link(subvec);
      gmap.linkSet(key, value, subvec);
    } else {
      gmap.set(key, gvalue);
    }
  }
  return gmap;
}

/**
 * Create a new GoogleRealtimeString, with `str`
 * as the initial value.
 */
export
function createString(str: IObservableString, model: gapi.drive.realtime.Model): GoogleRealtimeString {
  let googleObject = model.createString(str.text);
  let gstr = new GoogleRealtimeString(googleObject);
  return gstr;
}

/**
 * Given an IObservableVector, create a collaborative
 * GoogleRealtimeVector that has identical entries.
 */
export
function createVector<Synchronizable>(vec: IObservableVector<Synchronizable>, model: gapi.drive.realtime.Model): GoogleRealtimeVector<Synchronizable> {
  //Create a new GoogleRealtimeVector
  let googleObject = model.createList<GoogleSynchronizable>();
  let gvec = new GoogleRealtimeVector<Synchronizable>(
    googleObject, model, vec.converter);
  //Copy the vectory items into the newly created vector.
  for(let i=0; i<vec.length; i++) {
    let value: Synchronizable = vec.at(i);
    gvec.pushBack(value);
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
  } else {
    return item;
  }
}

export
class DefaultConverter<T> implements IRealtimeConverter<T>{
  from(value: Synchronizable): T {
    return value as any as T;
  }
  to(value: T): Synchronizable {
    return value as any as Synchronizable
  }
}
