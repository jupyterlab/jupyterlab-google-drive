// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import expect = require('expect.js');

import {
  JSONExt
} from '@phosphor/coreutils';

import {
  Message
} from '@phosphor/messaging';

import {
  Widget
} from '@phosphor/widgets';

import {
  editorServices
} from '@jupyterlab/codemirror';

import {
  MarkdownCell, MarkdownCellModel
} from '@jupyterlab/cells';

import {
  DocumentModel
} from '@jupyterlab/docregistry';

import {
  ModelDB, ObservableMap, ObservableList, ICollaborator
} from '@jupyterlab/observables';

import {
  Chatbox, ChatEntry 
} from '../../lib/chatbox';

import {
  defaultRenderMime
} from './util';


/**
 * Factory stuff.
 */
const editorFactory = editorServices.factoryService.newInlineEditor.bind(
    editorServices.factoryService);
const contentFactory = new Chatbox.ContentFactory({ editorFactory });
const rendermime = defaultRenderMime();

/**
 * Create a dummy collaborator map.
 */
class DummyCollaboratorMap extends ObservableMap<ICollaborator> {
  type: 'Map';

  readonly localCollaborator: ICollaborator = {
    userId: '1234',
    sessionId: '5678',
    displayName: 'A. U. Thor',
    color: '#00FF33',
    shortName: 'AU'
  }
}

/**
 * Create a dummy collaborative ModelDB.
 */
class DummyCollaborativeDB extends ModelDB {
  readonly isCollaborative: boolean = true;

  readonly collaborators = new DummyCollaboratorMap();

  readonly connected = Promise.resolve(void 0);
} 


describe('chatbox/chatbox', () => {

  describe('Chatbox', () => {

    let chatbox: Chatbox;
    let docModel: DocumentModel;
    let modelDB: DummyCollaborativeDB;
    let otherDocModel: DocumentModel;
    let otherModelDB: DummyCollaborativeDB;

    beforeEach((done) => {
      chatbox = new Chatbox({
        rendermime, contentFactory
      });
      modelDB = new DummyCollaborativeDB();
      docModel = new DocumentModel('', modelDB);
      otherModelDB = new DummyCollaborativeDB();
      otherDocModel = new DocumentModel('', otherModelDB);
      chatbox.model = docModel;
      Promise.all([modelDB.connected, otherModelDB.connected]).then(() => {
        done();
      });
    });

    afterEach(() => {
      chatbox.dispose();
      docModel.dispose();
      otherDocModel.dispose();
      modelDB.dispose();
      otherModelDB.dispose();
    });

    describe('#constructor()', () => {

      it('should create a new chatbox content widget', () => {
        Widget.attach(chatbox, document.body);
        expect(chatbox).to.be.a(Chatbox);
        expect(chatbox.node.classList).to.contain('jp-Chatbox');
      });

    });

    describe('#prompt', () => {

      it('should be a markdown cell widget', () => {
        Widget.attach(chatbox, document.body);
        expect(chatbox.prompt).to.be.a(MarkdownCell);
      });

      it('should be replaced after posting', () => {
        Widget.attach(chatbox, document.body);
        let old = chatbox.prompt;
        expect(old).to.be.a(MarkdownCell);
        old.model.value.text = 'An entry';
        chatbox.post();
        expect(chatbox.prompt).to.be.a(MarkdownCell);
        expect(chatbox.prompt).to.not.be(old);

      });

    });

    describe('#contentFactory', () => {

      it('should be the content factory used by the widget', () => {
        expect(chatbox.contentFactory).to.be.a(Chatbox.ContentFactory);
      });

    });

    describe('#log', () => {

      it('should get the log of chat entries', () => {
        expect(chatbox.log).to.be.a(ObservableList);
      });

    });

    describe('#widgets', () => {

      it('should get the array of rendered chat widgets', () => {
        Widget.attach(chatbox, document.body);
        chatbox.prompt.model.value.text = 'An entry';
        chatbox.post();
        expect(chatbox.widgets[0]).to.be.a(Widget);
      });

    });

    describe('#model', () => {

      it('should get the current model of the chatbox', () => {
        Widget.attach(chatbox, document.body);
        expect(chatbox.model).to.be(docModel);
      });

      it('should set the current model of the chatbox', () => {
        Widget.attach(chatbox, document.body);
        chatbox.model = otherDocModel;
        expect(chatbox.model).to.be(otherDocModel);
      });

      it('should clear the chatbox if given an invalid model', () => {
        Widget.attach(chatbox, document.body);
        chatbox.model = undefined;
        expect(chatbox.model).to.be(undefined);
        expect(chatbox.log).to.be(undefined);
        expect(chatbox.widgets.length).to.be(0);
      });

      //TODO: fix this test
      /*it('should be able to recall chat logs of other models', (done) => {
        Widget.attach(chatbox, document.body);
        chatbox.prompt.model.value.text = 'A: 1';
        chatbox.post();
        chatbox.prompt.model.value.text = 'A: 2';
        chatbox.post();
        chatbox.prompt.model.value.text = 'A: 3';
        chatbox.post();
        chatbox.model = otherDocModel;
        requestAnimationFrame(() => {
          chatbox.prompt.model.value.text = 'B: 1';
          chatbox.post();
          chatbox.prompt.model.value.text = 'B: 2';
          chatbox.post();
          expect(chatbox.log.length).to.be(2);
          expect(chatbox.log.get(chatbox.log.length-1).text).to.be('B: 2');

          chatbox.model = docModel;
          requestAnimationFrame(() => {
            console.log(chatbox.model);
            expect(chatbox.log.length).to.be(3);
            expect(chatbox.log.get(chatbox.log.length-1).text).to.be('A: 3');
            console.log('what the hell');
            done();
          });
        });
      });*/

    });

    describe('#post()', () => {

      it('should add a new entry to the log', () => {
        Widget.attach(chatbox, document.body);
        chatbox.prompt.model.value.text = 'An entry';
        chatbox.post();
        let entry = chatbox.log.get(chatbox.log.length-1);
        expect(entry.text).to.be('An entry');
        expect(JSONExt.deepEqual(entry.author,
               modelDB.collaborators.localCollaborator)).to.be(true);
      });

      it('should add a new entry widget to the panel', () => {
        Widget.attach(chatbox, document.body);
        chatbox.prompt.model.value.text = 'An entry';
        chatbox.post();
        let widget = chatbox.widgets[chatbox.widgets.length-1] as ChatEntry;
        expect(widget.model.text).to.be('An entry');
        expect(JSONExt.deepEqual(widget.model.author,
               modelDB.collaborators.localCollaborator)).to.be(true);
      });

      it('should not add an entry if the prompt has only whitespace', () => {
        Widget.attach(chatbox, document.body);
        chatbox.prompt.model.value.text = '   \n  ';
        chatbox.post();
        expect(chatbox.log.length).to.be(0);
        expect(chatbox.widgets.length).to.be(0);
      });

    });

    describe('#insertLineBreak()', () => {

      it('should insert a line break into the prompt', () => {
        Widget.attach(chatbox, document.body);

        let model = chatbox.prompt.model;
        expect(model.value.text).to.be.empty();
        chatbox.insertLinebreak();
        expect(model.value.text).to.be('\n');
      });

    });

    describe('#clear()', () => {

      it('should clear all of the content cells', () => {
        Widget.attach(chatbox, document.body);
        chatbox.prompt.model.value.text = 'An entry';
        chatbox.post();
        expect(chatbox.widgets.length).to.be.greaterThan(0);
        chatbox.clear();
        expect(chatbox.widgets.length).to.be(0);
        expect(chatbox.prompt.model.value.text).to.be('');
      });

    });

    describe('#dispose()', () => {

      it('should dispose the content widget', () => {
        Widget.attach(chatbox, document.body);
        expect(chatbox.isDisposed).to.be(false);
        chatbox.dispose();
        expect(chatbox.isDisposed).to.be(true);
      });

      it('should be safe to dispose multiple times', () => {
        Widget.attach(chatbox, document.body);
        expect(chatbox.isDisposed).to.be(false);
        chatbox.dispose();
        chatbox.dispose();
        expect(chatbox.isDisposed).to.be(true);
      });

    });

    describe('#onActivateRequest()', () => {

      it('should focus the prompt editor', done => {
        expect(chatbox.prompt).to.not.be.ok();
        Widget.attach(chatbox, document.body);
        requestAnimationFrame(() => {
          chatbox.activate();
          requestAnimationFrame(() => {
            expect(chatbox.prompt.editor.hasFocus()).to.be(true);
            done();
          });
        });
      });

    });

    describe('#onAfterAttach()', () => {

      it('should be called after attach, creating a prompt', () => {
        expect(chatbox.prompt).to.not.be.ok();
        Widget.attach(chatbox, document.body);
        expect(chatbox.prompt).to.be.ok();
      });

    });

  });

});
