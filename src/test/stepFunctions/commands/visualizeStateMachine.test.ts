/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { Disposable } from 'vscode-languageclient'
import { AslVisualization, AslVisualizationManager } from '../../../../src/stepFunctions/commands/visualizeStateMachine'
import { ext } from '../../../shared/extensionGlobals'
import { StateMachineGraphCache } from '../../../stepFunctions/utils'

// Top level defintions
let aslVisualizationManager: AslVisualizationManager
const sandbox = sinon.createSandbox()

const mockGlobalStorage: vscode.Memento = {
    update: sinon.spy(),
    get: sinon.stub().returns(undefined),
}

const mockUriOne: vscode.Uri = {
    authority: 'MockAuthorityOne',
    fragment: 'MockFragmentOne',
    fsPath: 'MockFSPathOne',
    query: 'MockQueryOne',
    path: 'MockPathOne',
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
    authority: 'MockAuthorityTwo',
    fragment: 'MockFragmentTwo',
    fsPath: 'MockFSPathTwo',
    query: 'MockQueryTwo',
    path: 'MockPathTwo',
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

describe('StepFunctions VisualizeStateMachine', () => {
    let mockVsCode: MockVSCode

    const oldWebviewScriptsPath = ext.visualizationResourcePaths.localWebviewScriptsPath
    const oldWebviewBodyPath = ext.visualizationResourcePaths.webviewBodyScript
    const oldCachePath = ext.visualizationResourcePaths.visualizationLibraryCachePath
    const oldScriptPath = ext.visualizationResourcePaths.visualizationLibraryScript
    const oldCssPath = ext.visualizationResourcePaths.visualizationLibraryCSS
    const oldThemePath = ext.visualizationResourcePaths.stateMachineCustomThemePath
    const oldThemeCssPath = ext.visualizationResourcePaths.stateMachineCustomThemeCSS

    // Before all
    before(async () => {
        mockVsCode = new MockVSCode()

        ext.visualizationResourcePaths.localWebviewScriptsPath = mockUriOne
        ext.visualizationResourcePaths.visualizationLibraryCachePath = mockUriOne
        ext.visualizationResourcePaths.stateMachineCustomThemePath = mockUriOne
        ext.visualizationResourcePaths.webviewBodyScript = mockUriOne
        ext.visualizationResourcePaths.visualizationLibraryScript = mockUriOne
        ext.visualizationResourcePaths.visualizationLibraryCSS = mockUriOne
        ext.visualizationResourcePaths.stateMachineCustomThemeCSS = mockUriOne

        sandbox.stub(StateMachineGraphCache.prototype, 'updateCachedFile').callsFake(async options => {
            return
        })
    })

    // Before each
    beforeEach(() => {
        aslVisualizationManager = new AslVisualizationManager()
    })

    // After each
    afterEach(async () => {
        mockVsCode.closeAll()
    })

    // After all
    after(() => {
        sandbox.restore()
        ext.visualizationResourcePaths.localWebviewScriptsPath = oldWebviewScriptsPath
        ext.visualizationResourcePaths.webviewBodyScript = oldWebviewBodyPath
        ext.visualizationResourcePaths.visualizationLibraryCachePath = oldCachePath
        ext.visualizationResourcePaths.visualizationLibraryScript = oldScriptPath
        ext.visualizationResourcePaths.visualizationLibraryCSS = oldCssPath
        ext.visualizationResourcePaths.stateMachineCustomThemePath = oldThemePath
        ext.visualizationResourcePaths.stateMachineCustomThemeCSS = oldThemeCssPath
    })

    // Tests
    it('Test AslVisualization on setup all properties are correct', async () => {
        const vis = new MockAslVisualization(mockTextDocumentOne)

        assert.deepStrictEqual(vis.documentUri, mockTextDocumentOne.uri)
        assert.strictEqual(vis.getIsPanelDisposed(), false)
        assert.strictEqual(vis.getDisposables().length, 4)

        let panel = vis.getPanel()
        assert(panel)
        panel = <vscode.WebviewPanel>panel
        assert(panel.title.length > 0)
        assert.strictEqual(panel.viewType, 'stateMachineVisualization')

        let webview = vis.getWebview()
        assert(webview)
        webview = <vscode.Webview>webview
        assert(webview.html)
    })

    it('Test AslVisualizationManager on setup managedVisualizations set is empty', async () => {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)
    })

    it('Test AslVisualizationManager managedVisualizations set still empty if no active text editor', async () => {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        try {
            // Preview with no active text editor
            await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage)
            assert.fail('Error should be thrown if no active text editor')
        } catch (error) {
            assert.ok(error instanceof Error)
            const errorCasted = <Error>error
            assert.strictEqual(errorCasted.message, 'Could not get active text editor for state machine render.')
            assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)
        }
    })

    it('Test AslVisualizationManager managedVisualizations set has one AslVis on first preview', async () => {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        try {
            // Preview Doc1
            mockVsCode.showTextDocument(mockTextDocumentOne)
            await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage)
            assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

            const managedVisualizations = aslVisualizationManager.getManagedVisualizations()
            for (const vis of managedVisualizations) {
                assert.deepStrictEqual(vis.documentUri, mockTextDocumentOne.uri)
            }
        } catch (error) {
            assert.ok(error instanceof Error)
            const errorCasted = <Error>error
            if (errorCasted.message === 'Could not get active text editor for state machine render.') {
                assert.fail('Should not throw error on valid visualization')
            } else {
                assert.fail(errorCasted.message)
            }
        }
    })

    it('Test AslVisualizationManager managedVisualizations set does not add second Vis on duplicate preview', async () => {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        try {
            // Preview Doc1
            mockVsCode.showTextDocument(mockTextDocumentOne)
            await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage)
            assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

            // Preview Doc1 Again
            await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage)
            assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

            const managedVisualizations = aslVisualizationManager.getManagedVisualizations()
            for (const vis of managedVisualizations) {
                assert.deepStrictEqual(vis.documentUri, mockTextDocumentOne.uri)
            }
        } catch (error) {
            assert.ok(error instanceof Error)
            const errorCasted = <Error>error
            if (errorCasted.message === 'Could not get active text editor for state machine render.') {
                assert.fail('Should not throw error on valid visualization')
            } else {
                assert.fail(errorCasted.message)
            }
        }
    })

    it('Test AslVisualizationManager managedVisualizations set adds second Vis on different preview', async () => {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        try {
            // Preview Doc1
            mockVsCode.showTextDocument(mockTextDocumentOne)
            await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage)
            assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

            // Preview Doc2
            mockVsCode.showTextDocument(mockTextDocumentTwo)
            await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage)
            assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 2)

            const managedVisualizations = aslVisualizationManager.getManagedVisualizations()
            let foundVisOne = false
            let foundVisTwo = false
            for (const vis of managedVisualizations) {
                if (vis.documentUri === mockTextDocumentOne.uri) {
                    foundVisOne = true
                } else if (vis.documentUri === mockTextDocumentTwo.uri) {
                    foundVisTwo = true
                }
            }
            assert(foundVisOne && foundVisTwo)
        } catch (error) {
            assert.ok(error instanceof Error)
            const errorCasted = <Error>error
            if (errorCasted.message === 'Could not get active text editor for state machine render.') {
                assert.fail('Should not throw error on valid visualization')
            } else {
                assert.fail(errorCasted.message)
            }
        }
    })

    it('Test AslVisualizationManager managedVisualizations set does not add duplicate renders when multiple Vis active', async () => {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        try {
            // Preview Doc1
            mockVsCode.showTextDocument(mockTextDocumentOne)
            await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage)
            assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

            // Preview Doc2
            mockVsCode.showTextDocument(mockTextDocumentTwo)
            await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage)
            assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 2)

            // Preview Doc1 Again
            mockVsCode.showTextDocument(mockTextDocumentOne)
            await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage)
            assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 2)

            // Preview Doc2 Again
            mockVsCode.showTextDocument(mockTextDocumentTwo)
            await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage)
            assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 2)

            const managedVisualizations = aslVisualizationManager.getManagedVisualizations()
            let foundVisOne = false
            let foundVisTwo = false
            for (const vis of managedVisualizations) {
                if (vis.documentUri === mockTextDocumentOne.uri) {
                    foundVisOne = true
                } else if (vis.documentUri === mockTextDocumentTwo.uri) {
                    foundVisTwo = true
                }
            }
            assert(foundVisOne && foundVisTwo)
        } catch (error) {
            assert.ok(error instanceof Error)
            const errorCasted = <Error>error
            if (errorCasted.message === 'Could not get active text editor for state machine render.') {
                assert.fail('Should not throw error on valid visualization')
            } else {
                assert.fail(errorCasted.message)
            }
        }
    })

    it('Test AslVisualizationManager managedVisualizations set removes visualization on visualization dispose, single vis', async () => {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        try {
            // Preview Doc1
            mockVsCode.showTextDocument(mockTextDocumentOne)
            const panel = await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage)
            assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

            // Dispose of visualization panel
            if (!panel) {
                assert.fail('Panel was not successfully generated')
            }
            const onDisposeSpy = sinon.spy(aslVisualizationManager, 'deleteVisualization')
            panel.dispose()
            assert(onDisposeSpy.calledOnce)
            assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)
        } catch (error) {
            assert.ok(error instanceof Error)
            const errorCasted = <Error>error
            if (errorCasted.message === 'Could not get active text editor for state machine render.') {
                assert.fail('Should not throw error on valid visualization')
            } else {
                assert.fail(errorCasted.message)
            }
        }
    })

    it('Test AslVisualizationManager managedVisualizations set removes correct visualization on visualization dispose, multiple vis', async () => {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        try {
            // Preview Doc1
            mockVsCode.showTextDocument(mockTextDocumentOne)
            const panel = await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage)
            assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

            // Preview Doc2
            mockVsCode.showTextDocument(mockTextDocumentTwo)
            await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage)
            assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 2)

            // Dispose of first visualization panel
            if (!panel) {
                assert.fail('Panel was not successfully generated')
            }
            const onDisposeSpy = sinon.spy(aslVisualizationManager, 'deleteVisualization')
            panel.dispose()
            assert(onDisposeSpy.calledOnce)
            assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)
        } catch (error) {
            assert.ok(error instanceof Error)
            const errorCasted = <Error>error
            if (errorCasted.message === 'Could not get active text editor for state machine render.') {
                assert.fail('Should not throw error on valid visualization')
            } else {
                assert.fail(errorCasted.message)
            }
        }
    })
})

class MockAslVisualization extends AslVisualization {
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

    public setDocument(document: vscode.TextDocument) {
        this.document = document
    }
}

class MockVSCode {
    public activeEditor: MockEditor | undefined = undefined
    private documents: Set<vscode.TextDocument> = new Set<vscode.TextDocument>()

    public showTextDocument(documentToShow: vscode.TextDocument) {
        let doc = this.getDocument(documentToShow)
        if (!doc) {
            this.documents.add(documentToShow)
            doc = documentToShow
        }
        this.updateActiveEditor(doc)

        // Update the return value for the stub with each call to showTextDocument
        sandbox.stub(vscode.window, 'activeTextEditor').value(this.activeEditor)
    }

    public closeAll() {
        this.activeEditor = undefined
        this.documents = new Set<vscode.TextDocument>()
    }

    private getDocument(documentToFind: vscode.TextDocument) {
        for (const doc of this.documents) {
            if (doc.uri.path === documentToFind.uri.path) {
                return doc
            }
        }

        return
    }

    private updateActiveEditor(document: vscode.TextDocument) {
        if (this.activeEditor) {
            this.activeEditor.setDocument(document)
        } else {
            this.activeEditor = new MockEditor(document)
        }
    }
}
