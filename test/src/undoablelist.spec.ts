// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import expect = require('expect.js');

import { JSONObject } from '@phosphor/coreutils';

import { GoogleUndoableList } from '../../lib/realtime/undoablelist';

import { loadGapi, initializeGapi, DEFAULT_CLIENT_ID } from '../../lib/gapi';

import { inMemoryModel } from './util';

const value: JSONObject = { name: 'foo' };

describe('GoogleUndoableList', () => {
  let model: inMemoryModel;
  let glist: gapi.drive.realtime.CollaborativeList<JSONObject>;

  before(done => {
    loadGapi(true).then(() => {
      initializeGapi(DEFAULT_CLIENT_ID).then(done);
    });
  });

  beforeEach(() => {
    model = new inMemoryModel();
    glist = model.model.createList<JSONObject>();
  });

  afterEach(() => {
    glist.removeAllEventListeners();
    model.dispose();
  });

  describe('#constructor', () => {
    it('should create a new GoogleUndoableList', () => {
      let list = new GoogleUndoableList(glist);
      expect(list).to.be.an(GoogleUndoableList);
    });
  });

  describe('#canRedo', () => {
    it('should return false if there is no history', () => {
      let list = new GoogleUndoableList(glist);
      expect(list.canRedo).to.be(false);
    });

    it('should return true if there is an undo that can be redone', () => {
      let list = new GoogleUndoableList(glist);
      list.push(value);
      list.undo();
      expect(list.canRedo).to.be(true);
    });
  });

  describe('#canUndo', () => {
    it('should return false if there is no history', () => {
      let list = new GoogleUndoableList(glist);
      expect(list.canUndo).to.be(false);
    });

    it('should return true if there is a change that can be undone', () => {
      let list = new GoogleUndoableList(glist);
      list.push(value);
      expect(list.canUndo).to.be(true);
    });
  });

  describe('#dispose()', () => {
    it('should dispose of the resources used by the list', () => {
      let list = new GoogleUndoableList(glist);
      list.dispose();
      expect(list.isDisposed).to.be(true);
      list.dispose();
      expect(list.isDisposed).to.be(true);
    });
  });

  describe('#beginCompoundOperation()', () => {
    it('should begin a compound operation', () => {
      let list = new GoogleUndoableList(glist);
      list.beginCompoundOperation();
      list.push(value);
      list.push(value);
      list.endCompoundOperation();
      expect(list.canUndo).to.be(true);
      list.undo();
      expect(list.canUndo).to.be(false);
    });

    it('should not be undoable if isUndoAble is set to false', () => {
      let list = new GoogleUndoableList(glist);
      list.beginCompoundOperation(false);
      list.push(value);
      list.push(value);
      list.endCompoundOperation();
      expect(list.canUndo).to.be(false);
    });
  });

  describe('#endCompoundOperation()', () => {
    it('should end a compound operation', () => {
      let list = new GoogleUndoableList(glist);
      list.beginCompoundOperation();
      list.push(value);
      list.push(value);
      list.endCompoundOperation();
      expect(list.canUndo).to.be(true);
      list.undo();
      expect(list.canUndo).to.be(false);
    });
  });

  describe('#undo()', () => {
    it('should undo a push', () => {
      let list = new GoogleUndoableList(glist);
      list.push(value);
      list.undo();
      expect(list.length).to.be(0);
    });

    it('should undo a pushAll', () => {
      let list = new GoogleUndoableList(glist);
      list.pushAll([value, value]);
      list.undo();
      expect(list.length).to.be(0);
    });

    it('should undo a remove', () => {
      let list = new GoogleUndoableList(glist);
      list.pushAll([value, value]);
      list.remove(0);
      list.undo();
      expect(list.length).to.be(2);
    });

    it('should undo a removeRange', () => {
      let list = new GoogleUndoableList(glist);
      list.pushAll([value, value, value, value, value, value]);
      list.removeRange(1, 3);
      list.undo();
      expect(list.length).to.be(6);
    });

    it('should undo a move', () => {
      let items = [value, value, value];
      let list = new GoogleUndoableList(glist);
      list.pushAll(items);
      list.move(1, 2);
      list.undo();
      expect((list.get(1) as any)['count']).to.be((items[1] as any)['count']);
    });
  });

  describe('#redo()', () => {
    it('should redo a push', () => {
      let list = new GoogleUndoableList(glist);
      list.push(value);
      list.undo();
      list.redo();
      expect(list.length).to.be(1);
    });

    it('should redo a pushAll', () => {
      let list = new GoogleUndoableList(glist);
      list.pushAll([value, value]);
      list.undo();
      list.redo();
      expect(list.length).to.be(2);
    });

    it('should redo a remove', () => {
      let list = new GoogleUndoableList(glist);
      list.pushAll([value, value]);
      list.remove(0);
      list.undo();
      list.redo();
      expect(list.length).to.be(1);
    });

    it('should redo a removeRange', () => {
      let list = new GoogleUndoableList(glist);
      list.pushAll([value, value, value, value, value, value]);
      list.removeRange(1, 3);
      list.undo();
      list.redo();
      expect(list.length).to.be(4);
    });

    it('should undo a move', () => {
      let items = [value, value, value];
      let list = new GoogleUndoableList(glist);
      list.pushAll(items);
      list.move(1, 2);
      list.undo();
      list.redo();
      expect((list.get(2) as any)['count']).to.be((items[1] as any)['count']);
    });
  });

  describe('#clearUndo()', () => {
    it('should clear the undo stack', () => {
      let list = new GoogleUndoableList(glist);
      list.push(value);
      list.clearUndo();
      expect(list.canUndo).to.be(false);
    });
  });
});
