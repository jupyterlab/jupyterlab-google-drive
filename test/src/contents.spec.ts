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
        return drive.delete(contents.path);
      }).then(done);
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
        drive.delete(contents.path).then(done);
      });
      drive.save(contents.path, contents).catch(done);
    });

    /*it('should fail for an incorrect model', (done) => {
      i++;
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name+String(i),
        path: DEFAULT_TEXT_FILE.path+String(i),
        format: undefined
      };
      let save = drive.save(contents.path, contents);
      expectFailure(save, done);
    });

    it('should fail for an incorrect response', (done) => {
      let save = drive.save('/foo', { type: 'file', name: 'test' });
      expectAjaxError(save, done, 'Invalid Status: 204');
    });*/

  });


  describe('#fileChanged', () => {

    it('should be emitted when a file changes', (done) => {
      drive.fileChanged.connect((sender, args) => {
        console.warn(args.newValue.path);
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

  /*describe('#newUntitled()', () => {

    it('should create a file', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(201, DEFAULT_FILE);
      });
      drive.newUntitled({ path: '/foo' }).then(model => {
        expect(model.path).to.be(DEFAULT_FILE.path);
        done();
      });
    });

    it('should create a directory', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(201, DEFAULT_DIR);
      });
      let options: Contents.ICreateOptions = {
        path: '/foo',
        type: 'directory'
      };
      let newDir = drive.newUntitled(options);
      newDir.then(model => {
        expect(model.content[0].path).to.be(DEFAULT_DIR.content[0].path);
        done();
      });
    });

    it('should emit the fileChanged signal', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(201, DEFAULT_FILE);
      });
      drive.fileChanged.connect((sender, args) => {
        expect(args.type).to.be('new');
        expect(args.oldValue).to.be(null);
        expect(args.newValue.path).to.be(DEFAULT_FILE.path);
        done();
      });
      drive.newUntitled({ type: 'file', ext: 'test' }).catch(done);
    });

    it('should fail for an incorrect model', (done) => {
      let drive = new Drive();
      let dir = JSON.parse(JSON.stringify(DEFAULT_DIR));
      dir.name = 1;
      let handler = new RequestHandler(() => {
        handler.respond(201, dir);
      });
      let options: Contents.ICreateOptions = {
        path: '/foo',
        type: 'file',
        ext: 'py'
      };
      let newFile = drive.newUntitled(options);
      expectFailure(newFile, done);
    });

    it('should fail for an incorrect response', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(200, DEFAULT_DIR);
      });
      let newDir = drive.newUntitled();
      expectAjaxError(newDir, done, 'Invalid Status: 200');
    });

  });*/

  /*describe('#delete()', () => {

    it('should delete a file', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(204, { });
      });
      drive.delete('/foo/bar.txt').then(() => {
        done();
      });
    });

    it('should emit the fileChanged signal', (done) => {
      let drive = new Drive();
      let path = '/foo/bar.txt';
      let handler = new RequestHandler(() => {
        handler.respond(204, { path });
      });
      drive.fileChanged.connect((sender, args) => {
        expect(args.type).to.be('delete');
        expect(args.oldValue.path).to.be(path);
        done();
      });
      drive.delete(path).catch(done);
    });

    it('should fail for an incorrect response', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(200, { });
      });
      let del = drive.delete('/foo/bar.txt');
      expectAjaxError(del, done, 'Invalid Status: 200');
    });

    it('should throw a specific error', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(400, { });
      });
      let del = drive.delete('/foo/');
      expectFailure(del, done, '');
    });

    it('should throw a general error', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(500, { });
      });
      let del = drive.delete('/foo/');
      expectFailure(del, done, '');
    });

  });

  describe('#rename()', () => {

    it('should rename a file', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(200, DEFAULT_FILE);
      });
      let rename = drive.rename('/foo/bar.txt', '/foo/baz.txt');
      rename.then(model => {
        expect(model.created).to.be(DEFAULT_FILE.created);
        done();
      });
    });

    it('should emit the fileChanged signal', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(200, DEFAULT_FILE);
      });
      drive.fileChanged.connect((sender, args) => {
        expect(args.type).to.be('rename');
        expect(args.oldValue.path).to.be('/foo/bar.txt');
        expect(args.newValue.path).to.be(DEFAULT_FILE.path);
        done();
      });
      drive.rename('/foo/bar.txt', '/foo/baz.txt').catch(done);
    });

    it('should fail for an incorrect model', (done) => {
      let drive = new Drive();
      let dir = JSON.parse(JSON.stringify(DEFAULT_FILE));
      delete dir.path;
      let handler = new RequestHandler(() => {
        handler.respond(200, dir);
      });
      let rename = drive.rename('/foo/bar.txt', '/foo/baz.txt');
      expectFailure(rename, done);
    });

    it('should fail for an incorrect response', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(201, DEFAULT_FILE);
      });
      let rename = drive.rename('/foo/bar.txt', '/foo/baz.txt');
      expectAjaxError(rename, done, 'Invalid Status: 201');
    });

  });

  describe('#copy()', () => {

    it('should copy a file', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(201, DEFAULT_FILE);
      });
      drive.copy('/foo/bar.txt', '/baz').then(model => {
        expect(model.created).to.be(DEFAULT_FILE.created);
        done();
      });
    });

    it('should emit the fileChanged signal', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(201, DEFAULT_FILE);
      });
      drive.fileChanged.connect((sender, args) => {
        expect(args.type).to.be('new');
        expect(args.oldValue).to.be(null);
        expect(args.newValue.path).to.be(DEFAULT_FILE.path);
        done();
      });
      drive.copy('/foo/bar.txt', '/baz').catch(done);
    });

    it('should fail for an incorrect model', (done) => {
      let drive = new Drive();
      let file = JSON.parse(JSON.stringify(DEFAULT_FILE));
      delete file.type;
      let handler = new RequestHandler(() => {
        handler.respond(201, file);
      });
      let copy = drive.copy('/foo/bar.txt', '/baz');
      expectFailure(copy, done);
    });

    it('should fail for an incorrect response', (done) => {
      let drive = new Drive();
      let handler = new RequestHandler(() => {
        handler.respond(200, DEFAULT_FILE);
      });
      let copy = drive.copy('/foo/bar.txt', '/baz');
      expectAjaxError(copy, done, 'Invalid Status: 200');
    });

  });

  describe('#createCheckpoint()', () => {

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
