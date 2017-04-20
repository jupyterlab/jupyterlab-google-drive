// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  JSONValue
} from '@phosphor/coreutils';

/**
 * An base class for wrappers around collaborative strings,
 * maps, and lists.
 */
export
interface GoogleRealtimeObject {
  /**
   * Access to the underlying collaborative object.
   */
  readonly googleObject: gapi.drive.realtime.CollaborativeObject;
}

/**
 * A type alias for the types of objects which may be inserted into
 * a Google Realtime Map/List and function correctly. More complex
 * models/objects will not work, and must be converted to/from one
 * of these types before insertion.
 */
export
type GoogleSynchronizable = JSONValue | gapi.drive.realtime.CollaborativeObject;
