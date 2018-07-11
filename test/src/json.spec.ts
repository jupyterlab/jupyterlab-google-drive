// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import expect = require('expect.js');

import { JSONValue } from '@phosphor/coreutils';

import { GoogleJSON } from '../../lib/realtime/json';

import { loadGapi, initializeGapi, DEFAULT_CLIENT_ID } from '../../lib/gapi';

import { inMemoryModel } from './util';

describe('GoogleJSON', () => {
  let model: inMemoryModel;
  let json: gapi.drive.realtime.CollaborativeMap<JSONValue>;

  before(done => {
    loadGapi(true).then(() => {
      initializeGapi(DEFAULT_CLIENT_ID).then(done);
    });
  });

  beforeEach(() => {
    model = new inMemoryModel();
    json = model.model.createMap<JSONValue>();
  });

  afterEach(() => {
    json.removeAllEventListeners();
    model.dispose();
  });

  describe('#constructor()', () => {
    it('should create an observable JSON object', () => {
      let item = new GoogleJSON(json);
      expect(item).to.be.an(GoogleJSON);
    });
  });

  describe('#toJSON()', () => {
    it('should serialize the model to JSON', () => {
      let item = new GoogleJSON(json);
      item.set('foo', 1);
      expect(item.toJSON()['foo']).to.be(1);
    });

    it('should return a copy of the data', () => {
      let item = new GoogleJSON(json);
      item.set('foo', { bar: 1 });
      let value = item.toJSON();
      value['bar'] = 2;
      expect((item.get('foo') as any)['bar']).to.be(1);
    });
  });
});
