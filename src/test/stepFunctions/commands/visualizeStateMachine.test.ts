/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { Disposable } from 'vscode-languageclient'
import { AslVisualization } from '../../../../src/stepFunctions/commands/visualizeStateMachine/aslVisualization'
import { AslVisualizationManager } from '../../../../src/stepFunctions/commands/visualizeStateMachine/aslVisualizationManager'

import { ext } from '../../../shared/extensionGlobals'
import { StateMachineGraphCache } from '../../../stepFunctions/utils'
import { assertThrowsError } from '../../shared/utilities/assertUtils'

// Top level defintions
let aslVisualizationManager: AslVisualizationManager
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

const mockUriThree: vscode.Uri = {
    authority: 'amazon.de',
    fragment: 'MockFragmentYaml',
    fsPath: 'MockFSPathYaml',
    query: 'MockQueryYaml',
    path: '/MockPathYaml',
    scheme: 'MockSchemeYaml',
    with: sinon.spy(),
    toJSON: sinon.spy(),
}

const mockDataJson =
    '{"Comment":"A Hello World example of the Amazon States Language using Pass states","StartAt":"Hello","States":{"Hello":{"Type":"Pass","Result":"Hello","Next":"World"},"World":{"Type":"Pass","Result":"${Text}","End":true}}}'

const mockDataYaml = `
Comment: "A Hello World example of the Amazon States Language using Pass states"
StartAt: Hello
States:
  Hello:
    Type: Pass
    Result: Hello
    Next: World
  World:
    Type: Pass
    Result: \$\{Text\}
    End: true
`

const mockTextDocumentYaml: vscode.TextDocument = {
    eol: 1,
    fileName: 'MockFileNameYaml',
    isClosed: false,
    isDirty: false,
    isUntitled: false,
    languageId: 'yaml',
    lineCount: 0,
    uri: mockUriThree,
    version: 0,
    getText: () => {
        return mockDataYaml
    },
    getWordRangeAtPosition: sinon.spy(),
    lineAt: sinon.spy(),
    offsetAt: sinon.spy(),
    positionAt: sinon.spy(),
    save: sinon.spy(),
    validatePosition: sinon.spy(),
    validateRange: sinon.spy(),
}

const mockTextDocumentJson: vscode.TextDocument = {
    eol: 1,
    fileName: 'MockFileNameJson',
    isClosed: false,
    isDirty: false,
    isUntitled: false,
    languageId: 'asl',
    lineCount: 0,
    uri: mockUriThree,
    version: 0,
    getText: () => {
        return mockDataJson
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

describe('StepFunctions VisualizeStateMachine', async () => {
    let mockVsCode: MockVSCode

    const oldWebviewScriptsPath = ext.visualizationResourcePaths.localWebviewScriptsPath
    const oldWebviewBodyPath = ext.visualizationResourcePaths.webviewBodyScript
    const oldCachePath = ext.visualizationResourcePaths.visualizationLibraryCachePath
    const oldScriptPath = ext.visualizationResourcePaths.visualizationLibraryScript
    const oldCssPath = ext.visualizationResourcePaths.visualizationLibraryCSS
    const oldThemePath = ext.visualizationResourcePaths.stateMachineCustomThemePath
    const oldThemeCssPath = ext.visualizationResourcePaths.stateMachineCustomThemeCSS

    // Before all
    before(() => {
        mockVsCode = new MockVSCode()

        ext.visualizationResourcePaths.localWebviewScriptsPath = mockUriOne
        ext.visualizationResourcePaths.visualizationLibraryCachePath = mockUriOne
        ext.visualizationResourcePaths.stateMachineCustomThemePath = mockUriOne
        ext.visualizationResourcePaths.webviewBodyScript = mockUriOne
        ext.visualizationResourcePaths.visualizationLibraryScript = mockUriOne
        ext.visualizationResourcePaths.visualizationLibraryCSS = mockUriOne
        ext.visualizationResourcePaths.stateMachineCustomThemeCSS = mockUriOne

        sandbox = sinon.createSandbox()
        sandbox.stub(StateMachineGraphCache.prototype, 'updateCachedFile').callsFake(async options => {
            return
        })
    })

    // Before each
    beforeEach(() => {
        aslVisualizationManager = new AslVisualizationManager(mockExtensionContext)
    })

    // After each
    afterEach(() => {
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
    it('Test AslVisualization on setup all properties are correct', () => {
        const vis = new MockAslVisualization(mockTextDocumentOne)

        assert.deepStrictEqual(vis.documentUri, mockTextDocumentOne.uri)
        assert.strictEqual(vis.getIsPanelDisposed(), false)
        assert.strictEqual(vis.getDisposables().length, 5)

        let panel = vis.getPanel()
        assert.ok(panel)
        panel = panel as vscode.WebviewPanel
        assert.ok(panel.title.length > 0)
        assert.strictEqual(panel.viewType, 'stateMachineVisualization')

        let webview = vis.getWebview()
        assert.ok(webview)
        webview = webview as vscode.Webview
        assert.ok(webview.html)
    })

    it('Test AslVisualizationManager on setup managedVisualizations set is empty', () => {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)
    })

    it('Test AslVisualizationManager managedVisualizations set still empty if no active text editor', async () => {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        // Preview with no active text editor
        const error = await assertThrowsError(async () => {
            await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, undefined)
        }, 'Expected an error to be thrown')

        assert.strictEqual(error.message, 'Could not get active text editor for state machine render.')
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)
    })

    it('Test AslVisualizationManager managedVisualizations set has one AslVis on first preview', async () => {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        // Preview Doc1
        mockVsCode.showTextDocument(mockTextDocumentOne)
        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, vscode.window.activeTextEditor)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

        const managedVisualizations = aslVisualizationManager.getManagedVisualizations()
        assert.ok(managedVisualizations.get(mockTextDocumentOne.uri.path))
    })

    it('Test AslVisualizationManager managedVisualizations set does not add second Vis on duplicate preview', async () => {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        // Preview Doc1
        mockVsCode.showTextDocument(mockTextDocumentOne)
        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, vscode.window.activeTextEditor)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

        // Preview Doc1 Again
        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, vscode.window.activeTextEditor)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

        const managedVisualizations = aslVisualizationManager.getManagedVisualizations()
        assert.ok(managedVisualizations.get(mockTextDocumentOne.uri.path))
    })

    it('Test AslVisualizationManager managedVisualizations set adds second Vis on different preview', async () => {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        // Preview Doc1
        mockVsCode.showTextDocument(mockTextDocumentOne)
        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, vscode.window.activeTextEditor)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

        // Preview Doc2
        mockVsCode.showTextDocument(mockTextDocumentTwo)
        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, vscode.window.activeTextEditor)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 2)

        const managedVisualizations = aslVisualizationManager.getManagedVisualizations()
        assert.ok(managedVisualizations.get(mockTextDocumentOne.uri.path))
        assert.ok(managedVisualizations.get(mockTextDocumentTwo.uri.path))
    })

    it('Test AslVisualizationManager managedVisualizations set does not add duplicate renders when multiple Vis active', async () => {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        // Preview Doc1
        mockVsCode.showTextDocument(mockTextDocumentOne)
        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, vscode.window.activeTextEditor)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

        // Preview Doc2
        mockVsCode.showTextDocument(mockTextDocumentTwo)
        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, vscode.window.activeTextEditor)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 2)

        // Preview Doc1 Again
        mockVsCode.showTextDocument(mockTextDocumentOne)
        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, vscode.window.activeTextEditor)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 2)

        // Preview Doc2 Again
        mockVsCode.showTextDocument(mockTextDocumentTwo)
        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, vscode.window.activeTextEditor)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 2)

        const managedVisualizations = aslVisualizationManager.getManagedVisualizations()
        assert.ok(managedVisualizations.get(mockTextDocumentOne.uri.path))
        assert.ok(managedVisualizations.get(mockTextDocumentTwo.uri.path))
    })

    it('Test AslVisualizationManager managedVisualizations set removes visualization on visualization dispose, single vis', async () => {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        // Preview Doc1
        mockVsCode.showTextDocument(mockTextDocumentOne)
        let panel = await aslVisualizationManager.visualizeStateMachine(
            mockGlobalStorage,
            vscode.window.activeTextEditor
        )
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

        // Dispose of visualization panel
        assert.ok(panel, 'Panel was not successfully generated')
        panel = panel as vscode.WebviewPanel
        panel.dispose()

        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)
    })

    it('Test AslVisualizationManager managedVisualizations set removes correct visualization on visualization dispose, multiple vis', async () => {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        // Preview Doc1
        mockVsCode.showTextDocument(mockTextDocumentOne)
        let panel = await aslVisualizationManager.visualizeStateMachine(
            mockGlobalStorage,
            vscode.window.activeTextEditor
        )
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

        // Preview Doc2
        mockVsCode.showTextDocument(mockTextDocumentTwo)
        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, vscode.window.activeTextEditor)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 2)

        // Dispose of first visualization panel
        assert.ok(panel, 'Panel was not successfully generated')
        panel = panel as vscode.WebviewPanel
        panel.dispose()

        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)
    })

    it('Test AslVisualisation sendUpdateMessage posts a correct update message for YAML files', async () => {
        const postMessage = sinon.spy()
        class MockAslVisualizationYaml extends AslVisualization {
            public getWebview(): vscode.Webview | undefined {
                return ({ postMessage } as unknown) as vscode.Webview
            }
        }

        const visualisation = new MockAslVisualizationYaml(mockTextDocumentYaml)

        await visualisation.sendUpdateMessage(mockTextDocumentYaml)

        const message = {
            command: 'update',
            stateMachineData: mockDataJson,
            isValid: true,
            errors: [],
        }

        assert.ok(postMessage.calledOnce)
        assert.deepEqual(postMessage.firstCall.args, [message])
    })

    it('Test AslVisualisation sendUpdateMessage posts a correct update message for ASL files', async () => {
        const postMessage = sinon.spy()
        class MockAslVisualizationJson extends AslVisualization {
            public getWebview(): vscode.Webview | undefined {
                return ({ postMessage } as unknown) as vscode.Webview
            }
        }

        const visualisation = new MockAslVisualizationJson(mockTextDocumentJson)

        await visualisation.sendUpdateMessage(mockTextDocumentJson)

        const message = {
            command: 'update',
            stateMachineData: mockDataJson,
            isValid: true,
            errors: [],
        }

        assert.ok(postMessage.calledOnce)
        assert.deepEqual(postMessage.firstCall.args, [message])
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
