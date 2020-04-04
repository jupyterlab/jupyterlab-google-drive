// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import expect = require('expect.js');

import { loadGapi } from '../../lib/gapi';

import { DocumentRegistry } from '@jupyterlab/docregistry';

import { Contents } from '@jupyterlab/services';

import { JSONExt, UUID } from '@lumino/coreutils';

import { GoogleDrive } from '../../lib/contents';

import { authorizeGapiTesting, expectFailure, expectAjaxError } from './util';

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
  content: 'This is a text file with unicode: 클래스의 정의한 함수',
  format: 'text'
};

const DEFAULT_NOTEBOOK: Contents.IModel = {
  name: 'jupyterlab_test_notebook_',
  path: 'My Drive/jupyterlab_test_directory/jupyterlab_test_notebook_',
  type: 'notebook',
  created: 'yesterday',
  last_modified: 'today',
  writable: false,
  mimetype: '',
  content: {
    cells: [
      {
        cell_type: 'markdown',
        metadata: {},
        source: ['Here is some content. 클래스의 정의한 함수']
      },
      {
        cell_type: 'code',
        execution_count: 1,
        metadata: {},
        outputs: [
          {
            name: 'stdout',
            output_type: 'stream',
            text: ['3\n']
          }
        ],
        source: ['print(1+2)']
      }
    ],
    metadata: {
      kernelspec: {
        display_name: 'Python 3',
        language: 'python',
        name: 'python3'
      },
      language_info: {
        codemirror_mode: {
          name: 'ipython',
          version: 3
        }
      }
    },
    nbformat: 4,
    nbformat_minor: 2
  },
  format: 'json'
};

describe('GoogleDrive', () => {
  let registry: DocumentRegistry;
  let drive: GoogleDrive;

  before(async () => {
    try {
      registry = new DocumentRegistry();
      await loadGapi();
      await authorizeGapiTesting();
    } catch (err) {
      console.error(err);
    }
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
    it('should get the contents of the pseudo-root', async () => {
      const contents = await drive.get('');
      expect(contents.name).to.be('');
      expect(contents.format).to.be('json');
      expect(contents.type).to.be('directory');
      expect(contents.writable).to.be(false);
    });

    it('should get the contents of `My Drive`', async () => {
      const contents = await drive.get('My Drive');
      expect(contents.name).to.be('My Drive');
      expect(contents.format).to.be('json');
      expect(contents.type).to.be('directory');
      expect(contents.writable).to.be(true);
    });

    it('should get the contents of `Shared with me`', async () => {
      const contents = await drive.get('Shared with me');
      expect(contents.name).to.be('Shared with me');
      expect(contents.format).to.be('json');
      expect(contents.type).to.be('directory');
      expect(contents.writable).to.be(false);
    });
  });

  describe('#save()', () => {
    it('should save a file', async () => {
      let id = UUID.uuid4();
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name + String(id),
        path: DEFAULT_TEXT_FILE.path + String(id)
      };
      const model = await drive.save(contents.path, contents);
      expect(model.name).to.be(contents.name);
      expect(model.content).to.be(contents.content);
      await drive.delete(model.path);
    });

    it('should be able to get an identical file back', async () => {
      let id = UUID.uuid4();
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name + String(id),
        path: DEFAULT_TEXT_FILE.path + String(id)
      };
      await drive.save(contents.path, contents);
      const model = await drive.get(contents.path);
      expect(model.name).to.be(contents.name);
      expect(model.content).to.be(contents.content);
      await drive.delete(model.path);
    });

    it('should save a notebook', async () => {
      let id = UUID.uuid4();
      // Note, include .ipynb to interpret the result as a notebook.
      let contents = {
        ...DEFAULT_NOTEBOOK,
        name: DEFAULT_NOTEBOOK.name + String(id) + '.ipynb',
        path: DEFAULT_NOTEBOOK.path + String(id) + '.ipynb'
      };
      const model = await drive.save(contents.path, contents);
      expect(model.name).to.be(contents.name);
      expect(JSONExt.deepEqual(model.content, contents.content)).to.be(true);
      await drive.delete(model.path);
    });

    it('should be able to get an identical notebook back', async () => {
      let id = UUID.uuid4();
      // Note, include .ipynb to interpret the result as a notebook.
      let contents = {
        ...DEFAULT_NOTEBOOK,
        name: DEFAULT_NOTEBOOK.name + String(id) + '.ipynb',
        path: DEFAULT_NOTEBOOK.path + String(id) + '.ipynb'
      };
      await drive.save(contents.path, contents);
      const model = await drive.get(contents.path);
      expect(model.name).to.be(contents.name);
      expect(JSONExt.deepEqual(model.content, contents.content)).to.be(true);
      await drive.delete(model.path);
    });

    it('should emit the fileChanged signal', async () => {
      let id = UUID.uuid4();
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name + String(id),
        path: DEFAULT_TEXT_FILE.path + String(id)
      };
      let called = false;
      const onFileChanged = (sender, args) => {
        expect(args.type).to.be('save');
        expect(args.oldValue).to.be(null);
        expect(args.newValue.path).to.be(contents.path);
        called = true;
      };
      drive.fileChanged.connect(onFileChanged);
      const model = await drive.save(contents.path, contents);
      drive.fileChanged.disconnect(onFileChanged);
      await drive.delete(model.path);
      expect(called).to.be(true);
    });
  });

  describe('#fileChanged', () => {
    it('should be emitted when a file changes', async () => {
      let called = false;
      const onFileChanged = (sender, args) => {
        expect(sender).to.be(drive);
        expect(args.type).to.be('new');
        expect(args.oldValue).to.be(null);
        expect(args.newValue.name.indexOf('untitled') === -1).to.be(false);
        called = true;
      };
      drive.fileChanged.connect(onFileChanged);
      const model = await drive.newUntitled({
        path: DEFAULT_DIRECTORY.path,
        type: 'file'
      });
      drive.fileChanged.disconnect(onFileChanged);
      await drive.delete(model.path);
      expect(called).to.be(true);
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

    before(async () => {
      let id = UUID.uuid4();
      contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name + String(id),
        path: DEFAULT_TEXT_FILE.path + String(id)
      };
      await drive.save(contents.path, contents);
    });

    after(async () => {
      await drive.delete(contents.path);
    });

    it('should get the url of a file', async () => {
      const url = await drive.getDownloadUrl(contents.path);
      expect(url.length > 0).to.be(true);
    });

    it('should not handle relative paths', async () => {
      let url = drive.getDownloadUrl('My Drive/../' + contents.path);
      await expectFailure(url);
    });
  });

  describe('#newUntitled()', () => {
    it('should create a file', async () => {
      const model = await drive.newUntitled({
        path: DEFAULT_DIRECTORY.path,
        type: 'file',
        ext: 'test'
      });
      expect(model.path).to.be(DEFAULT_DIRECTORY.path + '/' + model.name);
      expect(model.name.indexOf('untitled') === -1).to.be(false);
      expect(model.name.indexOf('test') === -1).to.be(false);
      await drive.delete(model.path);
    });

    it('should create a directory', async () => {
      let options: Contents.ICreateOptions = {
        path: DEFAULT_DIRECTORY.path,
        type: 'directory'
      };
      const model = await drive.newUntitled(options);
      expect(model.path).to.be(DEFAULT_DIRECTORY.path + '/' + model.name);
      expect(model.name.indexOf('Untitled Folder') === -1).to.be(false);
      await drive.delete(model.path);
    });

    it('should emit the fileChanged signal', async () => {
      let called = false;
      const onFileChanged = (sender, args) => {
        expect(args.type).to.be('new');
        expect(args.oldValue).to.be(null);
        expect(args.newValue.path).to.be(
          DEFAULT_DIRECTORY.path + '/' + args.newValue.name
        );
        expect(args.newValue.name.indexOf('untitled') === -1).to.be(false);
        expect(args.newValue.name.indexOf('test') === -1).to.be(false);
        called = true;
      };
      drive.fileChanged.connect(onFileChanged);
      const model = await drive.newUntitled({
        type: 'file',
        ext: 'test',
        path: DEFAULT_DIRECTORY.path
      });
      drive.fileChanged.disconnect(onFileChanged);
      await drive.delete(model.path);
      expect(called).to.be(true);
    });
  });

  describe('#delete()', () => {
    it('should delete a file', async () => {
      let id = UUID.uuid4();
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name + String(id),
        path: DEFAULT_TEXT_FILE.path + String(id)
      };
      const model = await drive.save(contents.path, contents);
      await drive.delete(model.path);
    });

    it('should emit the fileChanged signal', async () => {
      let id = UUID.uuid4();
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name + String(id),
        path: DEFAULT_TEXT_FILE.path + String(id)
      };
      const model = await drive.save(contents.path, contents);
      drive.fileChanged.connect((sender, args) => {
        expect(args.type).to.be('delete');
        expect(args.oldValue.path).to.be(contents.path);
      });
      await drive.delete(contents.path);
    });
  });

  describe('#rename()', () => {
    it('should rename a file', async () => {
      let id1 = UUID.uuid4();
      let id2 = UUID.uuid4();
      let path2 = DEFAULT_TEXT_FILE.path + id2;
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name + id1,
        path: DEFAULT_TEXT_FILE.path + id1
      };
      await drive.save(contents.path, contents);
      const model = await drive.rename(contents.path, path2);
      expect(model.name).to.be(DEFAULT_TEXT_FILE.name + id2);
      expect(model.path).to.be(path2);
      expect(model.content).to.be(contents.content);
      await drive.delete(model.path);
    });

    it('should emit the fileChanged signal', async () => {
      let id1 = UUID.uuid4();
      let id2 = UUID.uuid4();
      let path2 = DEFAULT_TEXT_FILE.path + id2;
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name + id1,
        path: DEFAULT_TEXT_FILE.path + id1
      };
      let called = false;
      const onFileChanged = (sender, args) => {
        expect(args.type).to.be('rename');
        expect(args.oldValue.path).to.be(contents.path);
        expect(args.newValue.path).to.be(path2);
        called = true;
      };
      await drive.save(contents.path, contents);
      drive.fileChanged.connect(onFileChanged);
      const model = await drive.rename(contents.path, path2);
      drive.fileChanged.disconnect(onFileChanged);
      await drive.delete(model.path);
      expect(called).to.be(true);
    });
  });

  describe('#copy()', () => {
    it('should copy a file', async () => {
      let id = UUID.uuid4();
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name + id,
        path: DEFAULT_TEXT_FILE.path + id
      };
      await drive.save(contents.path, contents);
      const model = await drive.copy(contents.path, DEFAULT_DIRECTORY.path);
      expect(model.name.indexOf(contents.name) === -1).to.be(false);
      expect(model.name.indexOf('Copy') === -1).to.be(false);
      expect(model.content).to.be(contents.content);

      let first = drive.delete(contents.path);
      let second = drive.delete(model.path);
      await Promise.all([first, second]);
    });

    it('should emit the fileChanged signal', async () => {
      let id = UUID.uuid4();
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name + id,
        path: DEFAULT_TEXT_FILE.path + id
      };
      let called = false;
      const onFileChanged = (sender, args) => {
        expect(args.type).to.be('new');
        expect(args.oldValue).to.be(null);
        expect(args.newValue.content).to.be(contents.content);
        expect(args.newValue.name.indexOf(contents.name) === -1).to.be(false);
        expect(args.newValue.name.indexOf('Copy') === -1).to.be(false);
        called = true;
      };
      await drive.save(contents.path, contents);
      drive.fileChanged.connect(onFileChanged);
      const model = await drive.copy(contents.path, DEFAULT_DIRECTORY.path);
      drive.fileChanged.disconnect(onFileChanged);
      let first = drive.delete(contents.path);
      let second = drive.delete(model.path);
      await Promise.all([first, second]);
      expect(called).to.be(true);
    });
  });

  describe('#createCheckpoint()', () => {
    it('should create a checkpoint', async () => {
      let id = UUID.uuid4();
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name + id,
        path: DEFAULT_TEXT_FILE.path + id
      };
      await drive.save(contents.path, contents);
      const cp = await drive.createCheckpoint(contents.path);
      expect(cp.last_modified.length > 0).to.be(true);
      expect(cp.id.length > 0).to.be(true);
      await drive.delete(contents.path);
    });
  });

  describe('#listCheckpoints()', () => {
    it('should list the checkpoints', async () => {
      let id = UUID.uuid4();
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name + id,
        path: DEFAULT_TEXT_FILE.path + id
      };
      await drive.save(contents.path, contents);
      const cp = await drive.createCheckpoint(contents.path);
      const cps = await drive.listCheckpoints(contents.path);
      expect(cps.filter(c => c.id === cp.id).length === 0).to.be(false);
      await drive.delete(contents.path);
    });
  });

  describe('#restoreCheckpoint()', () => {
    it('should restore a text file from a checkpoint', async () => {
      let id = UUID.uuid4();
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name + id,
        path: DEFAULT_TEXT_FILE.path + id
      };
      let newContents = {
        ...contents,
        content: 'This is some new text'
      };

      await drive.save(contents.path, contents);
      const cp = await drive.createCheckpoint(contents.path);
      const model = await drive.save(contents.path, newContents);
      expect(model.content).to.be(newContents.content);
      await drive.restoreCheckpoint(contents.path, cp.id);
      const oldModel = await drive.get(contents.path);
      expect(oldModel.content).to.be(contents.content);
      await drive.delete(contents.path);
    });

    it('should restore a notebook from a checkpoint', async () => {
      let id = UUID.uuid4();
      // Note, include .ipynb to interpret the result as a notebook.
      let contents = {
        ...DEFAULT_NOTEBOOK,
        name: DEFAULT_NOTEBOOK.name + String(id) + '.ipynb',
        path: DEFAULT_NOTEBOOK.path + String(id) + '.ipynb'
      };
      let newContents = {
        ...contents,
        content: 'This is some new text'
      };

      await drive.save(contents.path, contents);
      const cp = await drive.createCheckpoint(contents.path);
      const model = await drive.save(contents.path, newContents);
      expect(model.content).to.be(newContents.content);
      await drive.restoreCheckpoint(contents.path, cp.id);
      const oldModel = await drive.get(contents.path);
      expect(JSONExt.deepEqual(oldModel.content, contents.content)).to.be(true);
      await drive.delete(contents.path);
    });
  });

  describe('#deleteCheckpoint()', () => {
    it('should delete a checkpoint', async () => {
      let id = UUID.uuid4();
      let contents = {
        ...DEFAULT_TEXT_FILE,
        name: DEFAULT_TEXT_FILE.name + id,
        path: DEFAULT_TEXT_FILE.path + id
      };
      await drive.save(contents.path, contents);
      const cp = await drive.createCheckpoint(contents.path);
      await drive.deleteCheckpoint(contents.path, cp.id);
      const cps = await drive.listCheckpoints(contents.path);
      expect(cps.filter(c => c.id === cp.id).length === 0).to.be(true);
    });
  });
});
