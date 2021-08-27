/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { Disposable } from 'vscode-languageclient'
import { SamVisualization } from '../../samVisualize/samVisualization'
import { SamVisualizationManager } from '../../samVisualize/samVisualizationManager'
import * as vscode from 'vscode'

let samVisualizationManager: SamVisualizationManager
let sandbox: sinon.SinonSandbox

const mockGlobalStorage: vscode.Memento = {
    update: sinon.spy(),
    get: sinon.stub().returns(undefined),
}

const mockUriOne: vscode.Uri = {
    authority: 'amazon.com',
    fragment: 'MockFragmentOne',
    fsPath: 'MockFSPathOne',
    query: 'MockQueryOne',
    path: '/MockPathOne',
    scheme: 'MockSchemeOne',
    with: () => {
        return mockUriOne
    },
    toJSON: sinon.spy(),
}

const mockTextDocumentOne: vscode.TextDocument = {
    eol: 1,
    fileName: 'MockFileNameOne',
    isClosed: false,
    isDirty: false,
    isUntitled: false,
    languageId: 'MockLanguageIdOne',
    lineCount: 0,
    uri: mockUriOne,
    version: 0,
    getText: () => {
        return 'MockDocumentTextOne'
    },
    getWordRangeAtPosition: sinon.spy(),
    lineAt: sinon.spy(),
    offsetAt: sinon.spy(),
    positionAt: sinon.spy(),
    save: sinon.spy(),
    validatePosition: sinon.spy(),
    validateRange: sinon.spy(),
}

const mockUriTwo: vscode.Uri = {
    authority: 'amazon.org',
    fragment: 'MockFragmentTwo',
    fsPath: 'MockFSPathTwo',
    query: 'MockQueryTwo',
    path: '/MockPathTwo',
    scheme: 'MockSchemeTwo',
    with: sinon.spy(),
    toJSON: sinon.spy(),
}

const mockTextDocumentTwo: vscode.TextDocument = {
    eol: 1,
    fileName: 'MockFileNameTwo',
    isClosed: false,
    isDirty: false,
    isUntitled: false,
    languageId: 'MockLanguageIdTwo',
    lineCount: 0,
    uri: mockUriTwo,
    version: 0,
    getText: () => {
        return 'MockDocumentTextTwo'
    },
    getWordRangeAtPosition: sinon.spy(),
    lineAt: sinon.spy(),
    offsetAt: sinon.spy(),
    positionAt: sinon.spy(),
    save: sinon.spy(),
    validatePosition: sinon.spy(),
    validateRange: sinon.spy(),
}

const mockPosition: vscode.Position = {
    line: 0,
    character: 0,
    isBefore: sinon.spy(),
    isBeforeOrEqual: sinon.spy(),
    isAfter: sinon.spy(),
    isAfterOrEqual: sinon.spy(),
    isEqual: sinon.spy(),
    translate: sinon.spy(),
    with: sinon.spy(),
    compareTo: sinon.spy(),
}

const mockSelection: vscode.Selection = {
    anchor: mockPosition,
    active: mockPosition,
    end: mockPosition,
    isEmpty: false,
    isReversed: false,
    isSingleLine: false,
    start: mockPosition,
    contains: sinon.spy(),
    intersection: sinon.spy(),
    isEqual: sinon.spy(),
    union: sinon.spy(),
    with: sinon.spy(),
}

const mockRange: vscode.Range = {
    start: mockPosition,
    end: mockPosition,
    isEmpty: false,
    isSingleLine: false,
    contains: sinon.spy(),
    intersection: sinon.spy(),
    isEqual: sinon.spy(),
    union: sinon.spy(),
    with: sinon.spy(),
}

const mockExtensionContext: vscode.ExtensionContext = {
    extensionPath: '',
    globalState: mockGlobalStorage,
    globalStoragePath: '',
    logPath: '',
    storagePath: '',
    subscriptions: [],
    workspaceState: mockGlobalStorage,
    asAbsolutePath: sinon.spy(),
}

class MockSamVisualization extends SamVisualization {
    public getIsPanelDisposed(): boolean {
        return this.isPanelDisposed
    }

    public getDisposables(): Disposable[] {
        return this.disposables
    }
}

class MockEditor implements vscode.TextEditor {
    public readonly options = {}
    public readonly selection = mockSelection
    public readonly selections = []
    public readonly visibleRanges = [mockRange]
    public readonly edit = sinon.spy()
    public readonly insertSnippet = sinon.spy()
    public readonly setDecorations = sinon.spy()
    public readonly hide = sinon.spy()
    public readonly revealRange = sinon.spy()
    public readonly show = sinon.spy()
    public document: vscode.TextDocument

    public constructor(document: vscode.TextDocument) {
        this.document = document
    }

    public setDocument(document: vscode.TextDocument): void {
        this.document = document
    }
}

class MockVSCode {
    public activeEditor: MockEditor | undefined = undefined
    private documents: Set<vscode.TextDocument> = new Set<vscode.TextDocument>()

    public showTextDocument(documentToShow: vscode.TextDocument): void {
        let doc = this.getDocument(documentToShow)
        if (!doc) {
            this.documents.add(documentToShow)
            doc = documentToShow
        }
        this.updateActiveEditor(doc)

        // Update the return value for the stub with each call to showTextDocument
        sandbox.stub(vscode.window, 'activeTextEditor').value(this.activeEditor)
    }

    public closeAll(): void {
        this.activeEditor = undefined
        this.documents = new Set<vscode.TextDocument>()
    }

    private getDocument(documentToFind: vscode.TextDocument): vscode.TextDocument | undefined {
        for (const doc of this.documents) {
            if (doc.uri.path === documentToFind.uri.path) {
                return doc
            }
        }
        return
    }

    private updateActiveEditor(document: vscode.TextDocument): void {
        if (this.activeEditor) {
            this.activeEditor.setDocument(document)
        } else {
            this.activeEditor = new MockEditor(document)
        }
    }
}

describe('SAM Visualizer VisualizeSamTemplate', async function () {
    let mockVsCode: MockVSCode
    before(function () {
        mockVsCode = new MockVSCode()
        sandbox = sinon.createSandbox()
    })

    beforeEach(function () {
        samVisualizationManager = new SamVisualizationManager(mockExtensionContext)
    })

    afterEach(function () {
        mockVsCode.closeAll()
    })

    after(function () {
        sandbox.restore()
    })

    it('Test SamVisualization setup properties', function () {
        const samVis = new MockSamVisualization(mockTextDocumentOne, mockExtensionContext)

        assert.deepStrictEqual(samVis.textDocumentUri, mockTextDocumentOne.uri)
        assert.strictEqual(samVis.getIsPanelDisposed(), false)
        assert.strictEqual(samVis.getDisposables().length, 4)

        assert.ok(samVis.webviewPanel)
    })

    it('Test SamVisualizationManager initializes with no visualizations', function () {
        assert.strictEqual(samVisualizationManager.managedVisualizations.size, 0)
    })

    it('Test SamVisualizationManager picks up a SamVisualization', function () {
        assert.strictEqual(samVisualizationManager.managedVisualizations.size, 0)

        mockVsCode.showTextDocument(mockTextDocumentOne)
        samVisualizationManager.renderSamVisualization(vscode.window.activeTextEditor)

        assert.strictEqual(samVisualizationManager.managedVisualizations.size, 1)
        assert.ok(samVisualizationManager.managedVisualizations.get(mockTextDocumentOne.uri.path))
    })

    it('Test SamVisualizationManager does not add duplicate SamVisualizations', function () {
        assert.strictEqual(samVisualizationManager.managedVisualizations.size, 0)

        mockVsCode.showTextDocument(mockTextDocumentOne)
        samVisualizationManager.renderSamVisualization(vscode.window.activeTextEditor)

        assert.strictEqual(samVisualizationManager.managedVisualizations.size, 1)
        assert.ok(samVisualizationManager.managedVisualizations.get(mockTextDocumentOne.uri.path))

        mockVsCode.showTextDocument(mockTextDocumentOne)
        samVisualizationManager.renderSamVisualization(vscode.window.activeTextEditor)

        assert.strictEqual(samVisualizationManager.managedVisualizations.size, 1)
        assert.ok(samVisualizationManager.managedVisualizations.get(mockTextDocumentOne.uri.path))
    })

    it('Test SamVisualizationManager does add non-duplicate SamVisualization', function () {
        assert.strictEqual(samVisualizationManager.managedVisualizations.size, 0)

        mockVsCode.showTextDocument(mockTextDocumentOne)
        samVisualizationManager.renderSamVisualization(vscode.window.activeTextEditor)

        assert.strictEqual(samVisualizationManager.managedVisualizations.size, 1)
        assert.ok(samVisualizationManager.managedVisualizations.get(mockTextDocumentOne.uri.path))

        mockVsCode.showTextDocument(mockTextDocumentTwo)
        samVisualizationManager.renderSamVisualization(vscode.window.activeTextEditor)

        assert.strictEqual(samVisualizationManager.managedVisualizations.size, 2)
        assert.ok(samVisualizationManager.managedVisualizations.get(mockTextDocumentOne.uri.path))
        assert.ok(samVisualizationManager.managedVisualizations.get(mockTextDocumentTwo.uri.path))
    })

    it('Test SamVisualizationManager removes SamVisualization when its disposed', function () {
        assert.strictEqual(samVisualizationManager.managedVisualizations.size, 0)

        mockVsCode.showTextDocument(mockTextDocumentOne)
        const panel1 = samVisualizationManager.renderSamVisualization(vscode.window.activeTextEditor)
        assert.ok(panel1)

        mockVsCode.showTextDocument(mockTextDocumentTwo)
        const panel2 = samVisualizationManager.renderSamVisualization(vscode.window.activeTextEditor)
        assert.ok(panel2)

        assert.strictEqual(samVisualizationManager.managedVisualizations.size, 2)

        // Dispose the first one
        panel1.dispose()

        assert.strictEqual(samVisualizationManager.managedVisualizations.size, 1)

        assert.ifError(samVisualizationManager.managedVisualizations.get(mockTextDocumentOne.uri.path))
        assert.ok(samVisualizationManager.managedVisualizations.get(mockTextDocumentTwo.uri.path))
    })
})
