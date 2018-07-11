// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import expect = require('expect.js');

import { ICollaborator } from '@jupyterlab/observables';

import { CollaboratorMap } from '../../lib/realtime/collaborator';

import { loadGapi, initializeGapi, DEFAULT_CLIENT_ID } from '../../lib/gapi';

import { inMemoryModel } from './util';

const collaborator: ICollaborator = {
  userId: '1234',
  sessionId: '5678',
  displayName: 'User One',
  color: 'green',
  shortName: '1'
};

const adversary: ICollaborator = {
  userId: 'onetwo',
  sessionId: 'threefour',
  displayName: 'Horselover Fat',
  color: 'blue',
  shortName: 'o'
};

describe('CollaboratorMap', () => {
  let model: inMemoryModel;

  before(done => {
    loadGapi(true).then(() => {
      initializeGapi(DEFAULT_CLIENT_ID).then(done);
    });
  });

  beforeEach(() => {
    model = new inMemoryModel();
  });

  afterEach(() => {
    model.dispose();
  });

  describe('#constructor()', () => {
    it('should accept no arguments', () => {
      let value = new CollaboratorMap(model.doc);
      expect(value instanceof CollaboratorMap).to.be(true);
    });
  });

  describe('#type', () => {
    it('should return `Map`', () => {
      let value = new CollaboratorMap(model.doc);
      expect(value.type).to.be('Map');
    });
  });

  describe('#size', () => {
    it('should return the number of entries in the map', () => {
      let value = new CollaboratorMap(model.doc);
      value.set(collaborator.sessionId, collaborator);
      value.set(adversary.sessionId, adversary);
      // The dummy in-memory model has its own empty
      // collaborator, hence the additional +1.
      expect(value.size).to.be(3);
    });
  });

  describe('#changed', () => {
    it('should be emitted when the map changes state', () => {
      let called = false;
      let value = new CollaboratorMap(model.doc);
      value.changed.connect(() => {
        called = true;
      });
      value.set(collaborator.sessionId, collaborator);
      expect(called).to.be(true);
    });

    it('should have value changed args', () => {
      let called = false;
      let value = new CollaboratorMap(model.doc);
      value.changed.connect((sender, args) => {
        expect(sender).to.be(value);
        expect(args.type).to.be('add');
        expect(args.newValue).to.eql(collaborator);
        expect(args.oldValue).to.be(undefined);
        expect(args.key).to.be(collaborator.sessionId);
        called = true;
      });
      value.set(collaborator.sessionId, collaborator);
      expect(called).to.be(true);
    });
  });

  describe('#isDisposed', () => {
    it('should test whether the map is disposed', () => {
      let value = new CollaboratorMap(model.doc);
      expect(value.isDisposed).to.be(false);
      value.dispose();
      expect(value.isDisposed).to.be(true);
    });
  });

  describe('#dispose()', () => {
    it('should dispose of the resources held by the map', () => {
      let value = new CollaboratorMap(model.doc);
      value.set(collaborator.sessionId, collaborator);
      value.set(adversary.sessionId, adversary);
      value.dispose();
      expect(value.isDisposed).to.be(true);
    });
  });

  describe('#set()', () => {
    it('should set the item at a specific key', () => {
      let value = new CollaboratorMap(model.doc);
      value.set(collaborator.sessionId, collaborator);
      expect(value.get(collaborator.sessionId)).to.eql(collaborator);
    });

    it('should return the old value for that key', () => {
      let value = new CollaboratorMap(model.doc);
      value.set(collaborator.sessionId, collaborator);
      let x = value.set(collaborator.sessionId, adversary);
      expect(x).to.eql(collaborator);
    });

    it('should trigger a changed signal', () => {
      let called = false;
      let value = new CollaboratorMap(model.doc);
      value.changed.connect((sender, args) => {
        expect(sender).to.be(value);
        expect(args.type).to.be('add');
        expect(args.newValue).to.eql(collaborator);
        expect(args.oldValue).to.be(undefined);
        expect(args.key).to.be(collaborator.sessionId);
        called = true;
      });
      value.set(collaborator.sessionId, collaborator);
      expect(called).to.be(true);
    });
  });

  describe('#get()', () => {
    it('should get the value for a key', () => {
      let value = new CollaboratorMap(model.doc);
      value.set(collaborator.sessionId, collaborator);
      expect(value.get(collaborator.sessionId)).to.eql(collaborator);
    });

    it('should return undefined if the key does not exist', () => {
      let value = new CollaboratorMap(model.doc);
      value.set(collaborator.sessionId, collaborator);
      expect(value.get(adversary.sessionId)).to.be(undefined);
    });
  });

  describe('#has()', () => {
    it('should tell whether the key exists in a map', () => {
      let value = new CollaboratorMap(model.doc);
      value.set(collaborator.sessionId, collaborator);
      expect(value.has(collaborator.sessionId)).to.be(true);
      expect(value.has(adversary.sessionId)).to.be(false);
    });
  });

  describe('#keys()', () => {
    it('should return a list of the keys in the map', () => {
      let value = new CollaboratorMap(model.doc);
      value.set(collaborator.sessionId, collaborator);
      value.set(adversary.sessionId, adversary);
      let keys = value.keys();
      // Also include the dummy localCollaborator
      expect(keys).to.eql([
        value.localCollaborator.sessionId,
        collaborator.sessionId,
        adversary.sessionId
      ]);
    });
  });

  describe('#values()', () => {
    it('should return a list of the values in the map', () => {
      let value = new CollaboratorMap(model.doc);
      value.set(collaborator.sessionId, collaborator);
      value.set(adversary.sessionId, adversary);
      let keys = value.values();
      // Also include the dummy localCollaborator
      expect(keys).to.eql([value.localCollaborator, collaborator, adversary]);
    });
  });

  describe('#delete()', () => {
    it('should remove an item from the map', () => {
      let value = new CollaboratorMap(model.doc);
      value.set(collaborator.sessionId, collaborator);
      expect(value.get(collaborator.sessionId)).to.eql(collaborator);
      value.delete(collaborator.sessionId);
      expect(value.get(collaborator.sessionId)).to.be(undefined);
    });

    it('should return the value of the key it removed', () => {
      let value = new CollaboratorMap(model.doc);
      value.set(collaborator.sessionId, collaborator);
      expect(value.delete(collaborator.sessionId)).to.eql(collaborator);
      expect(value.delete(collaborator.sessionId)).to.be(undefined);
    });

    it('should trigger a changed signal', () => {
      let value = new CollaboratorMap(model.doc);
      value.set(collaborator.sessionId, collaborator);
      value.set(adversary.sessionId, adversary);
      let called = false;

      value.changed.connect((sender, args) => {
        expect(sender).to.be(value);
        expect(args.type).to.be('remove');
        expect(args.key).to.be(adversary.sessionId);
        expect(args.oldValue).to.eql(adversary);
        expect(args.newValue).to.be(undefined);
        called = true;
      });
      value.delete(adversary.sessionId);
      expect(called).to.be(true);
    });
  });

  describe('#clear()', () => {
    it('should remove all items from the map', () => {
      let value = new CollaboratorMap(model.doc);
      value.set(collaborator.sessionId, collaborator);
      value.set(adversary.sessionId, adversary);
      value.clear();
      expect(value.size).to.be(0);
      value.clear();
      expect(value.size).to.be(0);
    });

    it('should trigger a changed signal', () => {
      let value = new CollaboratorMap(model.doc);
      value.set(collaborator.sessionId, collaborator);
      let called = false;
      value.changed.connect((sender, args) => {
        expect(sender).to.be(value);
        expect(args.type).to.be('remove');
        expect(args.key).to.be(collaborator.sessionId);
        expect(args.oldValue).to.eql(collaborator);
        expect(args.newValue).to.be(undefined);
        called = true;
      });
      value.clear();
      expect(called).to.be(true);
    });
  });
});
