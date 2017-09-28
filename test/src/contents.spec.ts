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
  GoogleDrive
} from '../../lib/drive/contents';

import {
  authorizeGapiTesting
} from './util';

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
    //registry.dispose();
  });

  describe('#constructor()', () => {
    it('should create a new Google Drive object', () => {
      expect(drive).to.be.a(GoogleDrive);
    });
  });

  describe('get()', () => {
    
    it('should get the pseudo-root directory contents', (done) => {
      drive.get('My Drive').then(contents => {
        done();
      });
    });
  });

});
