// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import expect = require('expect.js');

import {
  loadGapi
} from '../../lib/gapi';

import {
  DocumentRegistry
} from '@jupyterlab/docregistry';

import {
  uuid
} from '@jupyterlab/coreutils';

import {
  Contents
} from '@jupyterlab/services';

import {
  GoogleDrive
} from '../../lib/drive/contents';

import {
  authorizeGapiTesting, expectFailure, expectAjaxError
} from './util';


const DEFAULT_DIRECTORY: Contents.IModel = {
  name: 'jupyterlab_test_directory',
  path: 'My Drive/jupyterlab_test_directory',
  type: 'directory',
  created: 'yesterday',
  last_modified: 'today',
  writable: false,
  mimetype: '',
  content: undefined,
  format: 'json'
};

const DEFAULT_TEXT_FILE: Contents.IModel = {
  name: 'jupyterlab_test_file_',
  path: 'My Drive/jupyterlab_test_directory/jupyterlab_test_file_',
  type: 'file',
  created: 'yesterday',
  last_modified: 'today',
  writable: false,
  mimetype: '',
  content: "This is a text file",
  format: 'text'
};

describe('GoogleDrive', () => {

  let registry: DocumentRegistry;
  let drive: GoogleDrive;

  before((done) => {
    registry = new DocumentRegistry();
    loadGapi().then(() => {
      authorizeGapiTesting().then(() => {
        done();
      }).catch( err => {
        console.error(err);
      });
    });
  });

  beforeEach(() => {
    drive = new GoogleDrive(registry);
  });

  afterEach(() => {
    drive.dispose();
  });

  describe('#constructor()', () => {

    it('should create a new Google Drive object', () => {
      let newDrive = new GoogleDrive(registry);
      expect(newDrive).to.be.a(GoogleDrive);
      newDrive.dispose();
    });
  });

  describe('#name', () => {
    it('should return "GDrive"', () => {
      expect(drive.name).to.be('GDrive');
    });

  });

  describe('#get()', () => {

    it('should get the contents of the pseudo-root', (done) => {
      drive.get('').then(contents => {
        expect(contents.name).to.be('');
        expect(contents.format).to.be('json');
        expect(contents.type).to.be('directory');
        expect(contents.writable).to.be(false);
        done();
      });
    });

    it('should get the contents of `My Drive`', (done) => {
      drive.get('My Drive').then(contents => {
        expect(contents.name).to.be('My Drive');
        expect(contents.format).to.be('json');
        expect(contents.type).to.be('directory');
        expect(contents.writable).to.be(true);
        done();
      });
    });

    it('should get the contents of `Shared with me`', (done) => {
      drive.get('Shared with me').then(contents => {
        expect(contents.name).to.be('Shared with me');
        expect(contents.format).to.be('json');
        expect(contents.type).to.be('directory');
        expect(contents.writable).to.be(false);
        done();
      });
    });

  });

  describe('#save()', () => {

    it('should save a file', (done) => {
      let id = uuid();
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name+String(id),
        path: DEFAULT_TEXT_FILE.path+String(id),
      };
      drive.save(contents.path, contents).then(model => {
        expect(model.name).to.be(contents.name);
        expect(model.content).to.be(contents.content);
        drive.delete(model.path).then(done);
      });
    });

    it('should emit the fileChanged signal', (done) => {
      let id = uuid();
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name+String(id),
        path: DEFAULT_TEXT_FILE.path+String(id),
      };
      drive.fileChanged.connect((sender, args) => {
        expect(args.type).to.be('save');
        expect(args.oldValue).to.be(null);
        expect(args.newValue.path).to.be(contents.path);
        drive.delete(args.newValue.path).then(done);
      });
      drive.save(contents.path, contents).catch(done);
    });

  });


  describe('#fileChanged', () => {

    it('should be emitted when a file changes', (done) => {
      drive.fileChanged.connect((sender, args) => {
        expect(sender).to.be(drive);
        expect(args.type).to.be('new');
        expect(args.oldValue).to.be(null);
        expect(args.newValue.name.indexOf('untitled') === -1).to.be(false);
        drive.delete(args.newValue.path).then(done);
      });
      drive.newUntitled({
        path: DEFAULT_DIRECTORY.path,
        type: 'file'
      }).catch(done);
    });

  });

  describe('#isDisposed', () => {

    it('should test whether the drive is disposed', () => {
      expect(drive.isDisposed).to.be(false);
      drive.dispose();
      expect(drive.isDisposed).to.be(true);
    });

  });

  describe('#dispose()', () => {

    it('should dispose of the resources used by the drive', () => {
      expect(drive.isDisposed).to.be(false);
      drive.dispose();
      expect(drive.isDisposed).to.be(true);
      drive.dispose();
      expect(drive.isDisposed).to.be(true);
    });

  });

  describe('#getDownloadUrl()', () => {

    let contents: Contents.IModel;

    before((done) => {
      let id = uuid();
      contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name+String(id),
        path: DEFAULT_TEXT_FILE.path+String(id),
      };
      drive.save(contents.path, contents).then(() => {
        done();
      });
    });

    after((done) => {
      drive.delete(contents.path).then(done);
    });

    it('should get the url of a file', (done) => {
      drive.getDownloadUrl(contents.path).then( url => {
        expect(url.length > 0 ).to.be(true);
        done();
      });
    });

    it('should not handle relative paths', (done) => {
      let url = drive.getDownloadUrl('My Drive/../'+contents.path);
      expectFailure(url, done);
    });

  });

  describe('#newUntitled()', () => {

    it('should create a file', (done) => {
      drive.newUntitled({
        path: DEFAULT_DIRECTORY.path,
        type: 'file',
        ext: 'test'
      }).then(model => {
        expect(model.path).to.be(DEFAULT_DIRECTORY.path+'/'+model.name);
        expect(model.name.indexOf('untitled') === -1).to.be(false);
        expect(model.name.indexOf('test') === -1).to.be(false);
        drive.delete(model.path).then(done);
      });
    });

    it('should create a directory', (done) => {
      let options: Contents.ICreateOptions = {
        path: DEFAULT_DIRECTORY.path,
        type: 'directory'
      };
      drive.newUntitled(options).then(model => {
        expect(model.path).to.be(DEFAULT_DIRECTORY.path+'/'+model.name);
        expect(model.name.indexOf('Untitled Folder') === -1).to.be(false);
        drive.delete(model.path).then(done);
      });
    });

    it('should emit the fileChanged signal', (done) => {
      drive.fileChanged.connect((sender, args) => {
        expect(args.type).to.be('new');
        expect(args.oldValue).to.be(null);
        expect(args.newValue.path).to.be(DEFAULT_DIRECTORY.path+
                                         '/'+args.newValue.name);
        expect(args.newValue.name.indexOf('untitled') === -1).to.be(false);
        expect(args.newValue.name.indexOf('test') === -1).to.be(false);
        drive.delete(args.newValue.path).then(done);
      });
      drive.newUntitled({
        type: 'file',
        ext: 'test',
        path: DEFAULT_DIRECTORY.path
      }).catch(done);
    });

  });

  describe('#delete()', () => {

    it('should delete a file', (done) => {
      let id = uuid();
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name+String(id),
        path: DEFAULT_TEXT_FILE.path+String(id),
      };
      drive.save(contents.path, contents).then(model => {
        drive.delete(model.path).then(done);
      });
    });

    it('should emit the fileChanged signal', (done) => {
      let id = uuid();
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name+String(id),
        path: DEFAULT_TEXT_FILE.path+String(id),
      };
      drive.save(contents.path, contents).then(model => {
        drive.fileChanged.connect((sender, args) => {
          expect(args.type).to.be('delete');
          expect(args.oldValue.path).to.be(contents.path);
          done();
        });
        drive.delete(contents.path).catch(done);
      });
    });

  });

  describe('#rename()', () => {

    it('should rename a file', (done) => {
      let id1 = uuid();
      let id2 = uuid();
      let path2 = DEFAULT_TEXT_FILE.path+id2;
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name+id1,
        path: DEFAULT_TEXT_FILE.path+id1,
      };
      drive.save(contents.path, contents).then(() => {
        drive.rename(contents.path, path2).then(model => {
          expect(model.name).to.be(DEFAULT_TEXT_FILE.name+id2);
          expect(model.path).to.be(path2);
          expect(model.content).to.be(contents.content);
          drive.delete(model.path).then(done);
        });
      });
    });

    it('should emit the fileChanged signal', (done) => {
      let id1 = uuid();
      let id2 = uuid();
      let path2 = DEFAULT_TEXT_FILE.path+id2;
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name+id1,
        path: DEFAULT_TEXT_FILE.path+id1,
      };
      drive.save(contents.path, contents).then(() => {
        drive.fileChanged.connect((sender, args) => {
          expect(args.type).to.be('rename');
          expect(args.oldValue.path).to.be(contents.path);
          expect(args.newValue.path).to.be(path2);
          drive.delete(args.newValue.path).then(done);
        });
        drive.rename(contents.path, path2);
      });
    });

  });

  describe('#copy()', () => {

    it('should copy a file', (done) => {
      let id = uuid();
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name+id,
        path: DEFAULT_TEXT_FILE.path+id,
      };
      drive.save(contents.path, contents).then(() => {
        drive.copy(contents.path, DEFAULT_DIRECTORY.path).then(model => {
          expect(model.name.indexOf(contents.name) === -1).to.be(false);
          expect(model.name.indexOf('Copy') === -1).to.be(false);
          expect(model.content).to.be(contents.content);

          let first = drive.delete(contents.path);
          let second = drive.delete(model.path);
          Promise.all([first, second]).then(() => { done(); }); 
        });
      });
    });

    it('should emit the fileChanged signal', (done) => {
      let id = uuid();
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name+id,
        path: DEFAULT_TEXT_FILE.path+id,
      };
      drive.save(contents.path, contents).then(() => {
        drive.fileChanged.connect((sender, args) => {
          expect(args.type).to.be('new');
          expect(args.oldValue).to.be(null);
          expect(args.newValue.content).to.be(contents.content);
          expect(args.newValue.name.indexOf(contents.name) === -1).to.be(false);
          expect(args.newValue.name.indexOf('Copy') === -1).to.be(false);

          let first = drive.delete(contents.path);
          let second = drive.delete(args.newValue.path);
          Promise.all([first, second]).then(() => { done(); }); 
        });
        drive.copy(contents.path, DEFAULT_DIRECTORY.path);
      });
    });

  });

  /*describe('#createCheckpoint()', () => {

    it('should create a checkpoint', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(201, DEFAULT_CP);
      });
      let checkpoint = drive.createCheckpoint('/foo/bar.txt');
      checkpoint.then(model => {
        expect(model.last_modified).to.be(DEFAULT_CP.last_modified);
        done();
      });
    });

    it('should fail for an incorrect model', (done) => {
      let drive = new Drive();
      let cp = JSON.parse(JSON.stringify(DEFAULT_CP));
      delete cp.last_modified;
      let handler = new RequestHandler(() => {
        handler.respond(201, cp);
      });
      let checkpoint = drive.createCheckpoint('/foo/bar.txt');
      expectFailure(checkpoint, done);
    });

    it('should fail for an incorrect response', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(200, DEFAULT_CP);
      });
      let checkpoint = drive.createCheckpoint('/foo/bar.txt');
      expectAjaxError(checkpoint, done, 'Invalid Status: 200');
    });

  });

  describe('#listCheckpoints()', () => {

    it('should list the checkpoints', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(200, [DEFAULT_CP, DEFAULT_CP]);
      });
      let checkpoints = drive.listCheckpoints('/foo/bar.txt');
      checkpoints.then(models => {
        expect(models[0].last_modified).to.be(DEFAULT_CP.last_modified);
        done();
      });
    });

    it('should fail for an incorrect model', (done) => {
      let drive = new Drive();
      let cp = JSON.parse(JSON.stringify(DEFAULT_CP));
      delete cp.id;
      let handler = new RequestHandler(() => {
        handler.respond(200, [cp, DEFAULT_CP]);
      });
      let checkpoints = drive.listCheckpoints('/foo/bar.txt');
      let second = () => {
        handler.onRequest = () => {
          handler.respond(200, DEFAULT_CP);
        };
        let newCheckpoints = drive.listCheckpoints('/foo/bar.txt');
        expectAjaxError(newCheckpoints, done, 'Invalid Checkpoint list');
      };

      expectFailure(checkpoints, second);
    });

    it('should fail for an incorrect response', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(201, { });
      });
      let checkpoints = drive.listCheckpoints('/foo/bar.txt');
      expectAjaxError(checkpoints, done, 'Invalid Status: 201');
    });

  });

  describe('#restoreCheckpoint()', () => {

    it('should restore a checkpoint', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(204, { });
      });
      let checkpoint = drive.restoreCheckpoint('/foo/bar.txt',
                                                  DEFAULT_CP.id);
      checkpoint.then(() => {
        done();
      });
    });

    it('should fail for an incorrect response', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(200, { });
      });
      let checkpoint = drive.restoreCheckpoint('/foo/bar.txt',
                                                  DEFAULT_CP.id);
      expectAjaxError(checkpoint, done, 'Invalid Status: 200');
    });

  });

  describe('#deleteCheckpoint()', () => {

    it('should delete a checkpoint', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(204, { });
      });
      drive.deleteCheckpoint('/foo/bar.txt', DEFAULT_CP.id)
      .then(() => { done(); });
    });

    it('should fail for an incorrect response', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(200, { });
      });
      let checkpoint = drive.deleteCheckpoint('/foo/bar.txt',
                                                  DEFAULT_CP.id);
      expectAjaxError(checkpoint, done, 'Invalid Status: 200');
    });
  */
});
