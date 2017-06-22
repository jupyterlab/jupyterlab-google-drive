// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import expect = require('expect.js');

import {
  GoogleString
} from '../../lib/realtime/string';

import {
  loadGapi, initializeGapi, DEFAULT_CLIENT_ID
} from '../../lib/gapi';

import {
  inMemoryModel
} from './util';

describe('GoogleString', () => {
  let model: inMemoryModel;
  let str: gapi.drive.realtime.CollaborativeString;

  before((done) => {
    loadGapi().then(() => {
      initializeGapi(DEFAULT_CLIENT_ID).then(done);
    });
  });

  beforeEach(() => {
    model = new inMemoryModel();
    str = model.model.createString();
  });

  afterEach(() => {
    str.removeAllEventListeners();
    model.dispose();
  });

  describe('#constructor()', () => {

    it('should accept no arguments', () => {
      let value = new GoogleString(str);
      expect(value instanceof GoogleString).to.be(true);
    });

  });

  describe('#type', () => {

    it('should return `String`', () => {
      let value = new GoogleString(str);
      expect(value.type).to.be('String');
    });
  });

  describe('#changed', () => {

    it('should be emitted when the string changes', () => {
      let called = false;
      let value = new GoogleString(str);
      value.changed.connect(() => { called = true; });
      value.text = "change";
      expect(called).to.be(true);
    });

    it('should have value changed args', () => {
      let called = false;
      let value = new GoogleString(str);
      value.changed.connect((sender, args) => {
        expect(sender).to.be(value);
        expect(args.type).to.be('set');
        expect(args.start).to.be(0);
        expect(args.end).to.be(3);
        expect(args.value).to.be('new');
        called = true;
      });
      value.text = 'new';
      expect(called).to.be(true);
    });

  });

  describe('#googleObject', () => {
    it('should get the CollaborativeObject associated with the string', () => {
      let value = new GoogleString(str);
      expect(value.googleObject).to.be(str);
    });

    it('should be settable', () => {
      let value = new GoogleString(str);
      let str2 = model.model.createString('new text');
      value.googleObject = str2;
      expect(value.text).to.be('new text');
      str2.removeAllEventListeners();
    });

    it('should emit change signals upon being set', () => {
      let called = false;
      let str2 = model.model.createString('text');
      let str3 = model.model.createString('new');
      let value = new GoogleString(str);
      value.text = 'text';
      value.changed.connect((sender, args) => {
        expect(sender).to.be(value);
        expect(args.type).to.be('set');
        expect(args.start).to.be(0);
        expect(args.end).to.be(3);
        expect(args.value).to.be('new');
        called = true;
      });
      // Don't expect a change signal if the text is the same.
      value.googleObject = str2;
      expect(called).to.be(false);
      expect(value.text).to.be('text');
      // Do expect a change signal if the text is different.
      value.googleObject = str3;
      expect(called).to.be(true);
      expect(value.text).to.be('new');
      str2.removeAllEventListeners();
      str3.removeAllEventListeners();
    });

  });

  describe('#isDisposed', () => {

    it('should test whether the string is disposed', () => {
      let value = new GoogleString(str);
      expect(value.isDisposed).to.be(false);
      value.dispose();
      expect(value.isDisposed).to.be(true);
    });

  });

  describe('#setter()', () => {

    it('should set the item at a specific index', () => {
      let value = new GoogleString(str);
      value.text = 'new';
      expect(value.text).to.eql('new');
    });

    it('should trigger a changed signal', () => {
      let called = false;
      let value = new GoogleString(str);
      value.text = 'old';
      value.changed.connect((sender, args) => {
        expect(sender).to.be(value);
        expect(args.type).to.be('set');
        expect(args.start).to.be(0);
        expect(args.end).to.be(3);
        expect(args.value).to.be('new');
        called = true;
      });
      value.text = 'new';
      expect(called).to.be(true);
    });

  });

  describe('#insert()', () => {

    it('should insert an substring into the string at a specific index', () => {
      let value = new GoogleString(str);
      value.text = 'one three';
      value.insert(4, 'two ');
      expect(value.text).to.eql('one two three');
    });

    it('should trigger a changed signal', () => {
      let called = false;
      let value = new GoogleString(str);
      value.text = 'one three';
      value.changed.connect((sender, args) => {
        expect(sender).to.be(value);
        expect(args.type).to.be('insert');
        expect(args.start).to.be(4);
        expect(args.end).to.be(8);
        expect(args.value).to.be('two ');
        called = true;
      });
      value.insert(4, 'two ');
      expect(called).to.be(true);
    });

  });

  describe('#remove()', () => {

    it('should remove a substring from the string', () => {
      let value = new GoogleString(str);
      value.text = 'one two two three';
      value.remove(4,8);
      expect(value.text).to.eql('one two three');
    });

    it('should trigger a changed signal', () => {
      let called = false;
      let value = new GoogleString(str);
      value.text = 'one two two three';
      value.changed.connect((sender, args) => {
        expect(sender).to.be(value);
        expect(args.type).to.be('remove');
        expect(args.start).to.be(4);
        expect(args.end).to.be(8);
        expect(args.value).to.be('two ');
        called = true;
      });
      value.remove(4,8);
      expect(called).to.be(true);
    });

  });

  describe('#clear()', () => {

    it('should empty the string', () => {
      let value = new GoogleString(str);
      value.text = 'full';
      value.clear();
      expect(value.text.length).to.be(0);
      expect(value.text).to.be('');
    });

    it('should trigger a changed signal', () => {
      let called = false;
      let value = new GoogleString(str);
      value.text = 'full';
      value.changed.connect((sender, args) => {
        expect(sender).to.be(value);
        expect(args.type).to.be('set');
        expect(args.start).to.be(0);
        expect(args.end).to.be(0);
        expect(args.value).to.be('');
        called = true;
      });
      value.clear();
      expect(called).to.be(true);
    });

  });

});

