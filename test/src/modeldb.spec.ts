// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import expect = require('expect.js');

import {
  toArray
} from '@phosphor/algorithm';

import {
  JSONValue, JSONExt, PromiseDelegate
} from '@phosphor/coreutils';

import {
  GoogleModelDB, GoogleObservableValue
} from '../../lib/realtime/modeldb';

import {
  GoogleString
} from '../../lib/realtime/string';

import {
  GoogleUndoableList
} from '../../lib/realtime/undoablelist';

import {
  GoogleJSON
} from '../../lib/realtime/json';

import {
  loadGapi, initializeGapi, DEFAULT_CLIENT_ID
} from '../../lib/gapi';

import {
  inMemoryModel, documentLoader
} from './util';

describe('GoogleObservableValue', () => {
  let model: inMemoryModel;

  before((done) => {
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

  describe('#constructor', () => {

    it('should accept a path and a `gapi.drive.realtime.Model`', () => {
      let value = new GoogleObservableValue('value', model.model);
      expect(value instanceof GoogleObservableValue).to.be(true);
      expect(value.get()).to.be(undefined);
    });

  });

  describe('#type', () => {

    it('should return `Value`', () => {
      let value = new GoogleObservableValue('value', model.model);
      expect(value.type).to.be('Value');
    });
  });

  describe('#isDisposed', () => {

    it('should test whether the value is disposed', () => {
      let value = new GoogleObservableValue('value', model.model);
      expect(value.isDisposed).to.be(false);
      value.dispose();
      expect(value.isDisposed).to.be(true);
    });

  });

  describe('#changed', () => {

    it('should be emitted when the map changes state', () => {
      let called = false;
      let value = new GoogleObservableValue('value', model.model);
      value.changed.connect(() => { called = true; });
      value.set('set');
      expect(called).to.be(true);
    });

    it('should have value changed args', () => {
      let called = false;
      let value = new GoogleObservableValue('value', model.model);
      value.changed.connect((sender, args) => {
        expect(sender).to.be(value);
        expect(args.newValue).to.be('set');
        expect(args.oldValue).to.be(undefined);
        called = true;
      });
      value.set('set');
      expect(called).to.be(true);
    });

  });

  describe('#get', () => {

    it('should get the value of the object', () => {
      let value = new GoogleObservableValue('value', model.model);
      value.set('value');
      expect(value.get()).to.be('value');
      let value2 = new GoogleObservableValue('value2', model.model);
      value2.set({ one: 'one', two: 2 });
      expect(JSONExt.deepEqual(value2.get(), { one: 'one', two: 2 })).to.be(true);
    });

  });

  describe('#set', () => {

    it('should set the value of the object', () => {
      let value = new GoogleObservableValue('value', model.model);
      value.set('value');
      expect(value.get()).to.be('value');
    });

  });

});


describe('GoogleModelDB', () => {

  let defaultOptions: GoogleModelDB.ICreateOptions;
  let connector: PromiseDelegate<void>;
  let model: inMemoryModel;

  beforeEach(() => {
    connector = new PromiseDelegate<void>();
    model = new inMemoryModel();
    defaultOptions = {
      filePath: 'path',
      documentLoader: (path: string) => {
        return connector.promise.then(() => {
          return model.doc;
        });
      }
    }
  });

  afterEach(() => {
    model.dispose();
  });

  describe('#constructor()', () => {

    it('should accept no arguments', () => {
      let db = new GoogleModelDB(defaultOptions);
      expect(db instanceof GoogleModelDB).to.be(true);
    });

    it('should accept a basePath', () => {
      let db = new GoogleModelDB({ basePath: 'base', ...defaultOptions });
      expect(db instanceof GoogleModelDB).to.be(true);
    });

    it('should accept a baseDB', () => {
      let base = new GoogleModelDB(defaultOptions);
      let db = new GoogleModelDB({ baseDB: base, ...defaultOptions });
      expect(db instanceof GoogleModelDB).to.be(true);
    });

    it('should update DB values on file load', (done) => {
      let db = new GoogleModelDB(defaultOptions);
      // Create empty placeholder values that will
      // be filled on file load
      let str = db.createString('string');
      let list = db.createList<JSONValue>('list');
      let map = db.createMap('map');
      let val = db.createValue('val');

      db.connected.then(() => {
        let checkStr = db.get('string') as GoogleString;
        expect(checkStr.text).to.be('some text');
        let checkList = db.get('list') as GoogleUndoableList<number>;
        expect(toArray(checkList)).to.eql([1, 2, 3]);
        let checkMap = db.get('map') as GoogleJSON;
        expect(checkMap.get('foo')).to.be('bar');
        let checkVal = db.get('val') as GoogleObservableValue;
        expect(checkVal.get()).to.eql({ a: 1, b: 2 });
        done();
      });

      // Create filled values.
      let newStr = model.model.createString('some text');
      let newList = model.model.createList<number>([1, 2, 3]);
      let newMap = model.model.createMap();
      newMap.set('foo', 'bar');
      model.model.getRoot().set('string', newStr);
      model.model.getRoot().set('list', newList);
      model.model.getRoot().set('map', newMap);
      model.model.getRoot().set('val', { a: 1, b: 2 });

      connector.resolve(void 0);
    });


  });

  describe('#isDisposed', () => {

    it('should test whether it is disposed', () => {
      let db = new GoogleModelDB(defaultOptions);
      expect(db.isDisposed).to.be(false);
      db.dispose();
      expect(db.isDisposed).to.be(true);
    });

  });

  describe('#basePath', () => {

    it('should return an empty string for a model without a baseDB', () => {
      let db = new GoogleModelDB(defaultOptions);
      expect(db.basePath).to.be('');
    });

    it('should return the base path', () => {
      let db = new GoogleModelDB({ basePath: 'base', ...defaultOptions });
      expect(db.basePath).to.be('base');
    });

  });

  describe('#isPrepopulated', () => {

    it('should return false for a fresh in-memory database', (done) => {
      let db = new GoogleModelDB(defaultOptions);
      db.connected.then(() => {
        expect(db.isPrepopulated).to.be(false);
        done();
      });
      connector.resolve(void 0)
    });

    it('should return true for a database that has values in it', (done) => {
      let db = new GoogleModelDB(defaultOptions);
      db.connected.then(() => {
        expect(db.isPrepopulated).to.be(true);
        done();
      });
      let str = model.model.createString('Hello, world');
      model.model.getRoot().set('value', str);
      connector.resolve(void 0)
    });
  });

  describe('#isCollaborative', () => {

    it('should return true', () => {
      let db = new GoogleModelDB(defaultOptions);
      expect(db.isCollaborative).to.be(true);
    });

  });

  describe('#connected', () => {

    it('should resolve after file loading', (done) => {
      let db = new GoogleModelDB(defaultOptions);
      db.connected.then(done);
      connector.resolve(void 0);
    });

  });

  describe('#get', () => {

    it('should get a value that exists at a path', () => {
      let db = new GoogleModelDB(defaultOptions);
      let value = db.createValue('value');
      let value2 = db.get('value');
      expect(value2).to.be(value);
    });

    it('should return undefined for a value that does not exist', () => {
      let db = new GoogleModelDB(defaultOptions);
      expect(db.get('value')).to.be(undefined);
    });

  });

  describe('#has', () => {

    it('should return true if a value exists at a path', () => {
      let db = new GoogleModelDB(defaultOptions);
      let value = db.createValue('value');
      expect(db.has('value')).to.be(true);
    });

    it('should return false for a value that does not exist', () => {
      let db = new GoogleModelDB(defaultOptions);
      expect(db.has('value')).to.be(false);
    });

  });

  describe('#createString', () => {

    it('should create an GoogleString`', () => {
      let db = new GoogleModelDB(defaultOptions);
      let str = db.createString('str');
      expect(str instanceof GoogleString).to.be(true);
    });

    it('should be able to retrieve that string using `get`', () => {
      let db = new GoogleModelDB(defaultOptions);
      let str = db.createString('str');
      expect(db.get('str')).to.be(str);
    });

  });

  describe('#createList', () => {

    it('should create an GoogleUndoableList`', () => {
      let db = new GoogleModelDB(defaultOptions);
      let str = db.createList<JSONValue>('vec');
      expect(str instanceof GoogleUndoableList).to.be(true);
    });

    it('should be able to retrieve that vector using `get`', () => {
      let db = new GoogleModelDB(defaultOptions);
      let vec = db.createList<JSONValue>('vec');
      expect(db.get('vec')).to.be(vec);
    });

  });

  describe('#createMap', () => {

    it('should create an ObservableMap`', () => {
      let db = new GoogleModelDB(defaultOptions);
      let map = db.createMap('map');
      expect(map instanceof GoogleJSON).to.be(true);
    });

    it('should be able to retrieve that map using `get`', () => {
      let db = new GoogleModelDB(defaultOptions);
      let map = db.createMap('map');
      expect(db.get('map')).to.be(map);
    });

  });

  describe('#createValue', () => {

    it('should create an GoogleObservableValue`', () => {
      let db = new GoogleModelDB(defaultOptions);
      let value = db.createValue('value');
      expect(value instanceof GoogleObservableValue).to.be(true);
    });

    it('should be able to retrieve that value using `get`', () => {
      let db = new GoogleModelDB(defaultOptions);
      let value = db.createString('value');
      expect(db.get('value')).to.be(value);
    });

  });

  describe('#setValue', () => {

    it('should set a value at a path', () => {
      let db = new GoogleModelDB(defaultOptions);
      let value = db.createValue('value');
      db.setValue('value', 'set');
      expect(value.get()).to.be('set');
    });

  });

  describe('#getValue', () => {

    it('should get a value at a path', () => {
      let db = new GoogleModelDB(defaultOptions);
      let value = db.createValue('value');
      value.set('set');
      expect(db.getValue('value')).to.be('set');
    });

  });

  describe('#view', () => {

    it('should should return a GoogleModelDB', () => {
      let db = new GoogleModelDB(defaultOptions);
      let view = db.view('');
      expect(view instanceof GoogleModelDB).to.be(true);
      expect(view === db).to.be(false);
    });

    it('should set the baseDB path on the view', () => {
      let db = new GoogleModelDB(defaultOptions);
      let view = db.view('base');
      expect(view.basePath).to.be('base');
    });

    it('should return a view onto the base GoogleModelDB', () => {
      let db = new GoogleModelDB(defaultOptions);
      let view = db.view('base');

      db.createString('base.str1');
      expect(db.get('base.str1')).to.be(view.get('str1'));

      view.createString('str2');
      expect(db.get('base.str2')).to.be(view.get('str2'));
    });

    it('should be stackable', () => {
      let db = new GoogleModelDB(defaultOptions);
      let view = db.view('one');
      let viewView = view.view('two');

      expect(view.basePath).to.be('one');
      expect(viewView.basePath).to.be('two');

      viewView.createString('str');
      expect(viewView.get('str')).to.be(view.get('two.str'));
      expect(viewView.get('str')).to.be(db.get('one.two.str'));
    });

  });

  describe('#dispose', () => {

    it('should dispose of the resources used by the model', () => {
      let db = new GoogleModelDB(defaultOptions);
      let str = db.createString('str');
      let view = db.view('base');
      let str2 = view.createString('str');
      expect(db.isDisposed).to.be(false);
      expect(str.isDisposed).to.be(false);
      expect(view.isDisposed).to.be(false);
      expect(str2.isDisposed).to.be(false);
      db.dispose();
      expect(db.isDisposed).to.be(true);
      expect(str.isDisposed).to.be(true);
      expect(view.isDisposed).to.be(true);
      expect(str2.isDisposed).to.be(true);
    });

    it('should not dispose of resources in base databases', () => {
      let db = new GoogleModelDB(defaultOptions);
      let view = db.view('base');
      let str = db.createString('str');
      let str2 = view.createString('str');
      expect(db.isDisposed).to.be(false);
      expect(str.isDisposed).to.be(false);
      expect(view.isDisposed).to.be(false);
      expect(str2.isDisposed).to.be(false);
      view.dispose();
      expect(view.isDisposed).to.be(true);
      expect(str2.isDisposed).to.be(true);
      expect(db.isDisposed).to.be(false);
      expect(str.isDisposed).to.be(false);
    });

    it('should be safe to call more than once', () => {
      let db = new GoogleModelDB(defaultOptions);
      expect(db.isDisposed).to.be(false);
      db.dispose();
      expect(db.isDisposed).to.be(true);
    });

  });

});
