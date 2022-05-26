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

import { StateMachineGraphCache } from '../../../stepFunctions/utils'

import { YAML_ASL, JSON_ASL } from '../../../../src/stepFunctions/constants/aslFormats'
import globals from '../../../shared/extensionGlobals'
import { FakeExtensionContext } from '../../fakeExtensionContext'

// Top level defintions
let aslVisualizationManager: AslVisualizationManager

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
    languageId: YAML_ASL,
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
    languageId: JSON_ASL,
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

describe('StepFunctions VisualizeStateMachine', async function () {
    const oldWebviewScriptsPath = globals.visualizationResourcePaths.localWebviewScriptsPath
    const oldWebviewBodyPath = globals.visualizationResourcePaths.webviewBodyScript
    const oldCachePath = globals.visualizationResourcePaths.visualizationLibraryCachePath
    const oldScriptPath = globals.visualizationResourcePaths.visualizationLibraryScript
    const oldCssPath = globals.visualizationResourcePaths.visualizationLibraryCSS
    const oldThemePath = globals.visualizationResourcePaths.stateMachineCustomThemePath
    const oldThemeCssPath = globals.visualizationResourcePaths.stateMachineCustomThemeCSS

    before(function () {
        globals.visualizationResourcePaths.localWebviewScriptsPath = mockUriOne
        globals.visualizationResourcePaths.visualizationLibraryCachePath = mockUriOne
        globals.visualizationResourcePaths.stateMachineCustomThemePath = mockUriOne
        globals.visualizationResourcePaths.webviewBodyScript = mockUriOne
        globals.visualizationResourcePaths.visualizationLibraryScript = mockUriOne
        globals.visualizationResourcePaths.visualizationLibraryCSS = mockUriOne
        globals.visualizationResourcePaths.stateMachineCustomThemeCSS = mockUriOne

        sinon.stub(StateMachineGraphCache.prototype, 'updateCachedFile').callsFake(async options => {
            return
        })
    })

    beforeEach(async function () {
        const fakeExtCtx = await FakeExtensionContext.create()
        fakeExtCtx.globalState = mockGlobalStorage
        fakeExtCtx.workspaceState = mockGlobalStorage
        fakeExtCtx.asAbsolutePath = sinon.spy()
        aslVisualizationManager = new AslVisualizationManager(fakeExtCtx)
    })

    after(function () {
        sinon.restore()
        globals.visualizationResourcePaths.localWebviewScriptsPath = oldWebviewScriptsPath
        globals.visualizationResourcePaths.webviewBodyScript = oldWebviewBodyPath
        globals.visualizationResourcePaths.visualizationLibraryCachePath = oldCachePath
        globals.visualizationResourcePaths.visualizationLibraryScript = oldScriptPath
        globals.visualizationResourcePaths.visualizationLibraryCSS = oldCssPath
        globals.visualizationResourcePaths.stateMachineCustomThemePath = oldThemePath
        globals.visualizationResourcePaths.stateMachineCustomThemeCSS = oldThemeCssPath
    })

    it('Test AslVisualization on setup all properties are correct', function () {
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

    it('Test AslVisualizationManager on setup managedVisualizations set is empty', function () {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)
    })

    it('Test AslVisualizationManager managedVisualizations set has one AslVis on first preview', async function () {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, mockTextDocumentOne)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

        const managedVisualizations = aslVisualizationManager.getManagedVisualizations()
        assert.ok(managedVisualizations.get(mockTextDocumentOne.uri.fsPath))
    })

    it('Test AslVisualizationManager managedVisualizations set does not add second Vis on duplicate preview', async function () {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, mockTextDocumentOne)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, mockTextDocumentOne)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

        const managedVisualizations = aslVisualizationManager.getManagedVisualizations()
        assert.ok(managedVisualizations.get(mockTextDocumentOne.uri.fsPath))
    })

    it('Test AslVisualizationManager managedVisualizations set adds second Vis on different preview', async function () {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, mockTextDocumentOne)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, mockTextDocumentTwo)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 2)

        const managedVisualizations = aslVisualizationManager.getManagedVisualizations()
        assert.ok(managedVisualizations.get(mockTextDocumentOne.uri.fsPath))
        assert.ok(managedVisualizations.get(mockTextDocumentTwo.uri.fsPath))
    })

    it('Test AslVisualizationManager managedVisualizations set does not add duplicate renders when multiple Vis active', async function () {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, mockTextDocumentOne)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, mockTextDocumentTwo)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 2)

        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, mockTextDocumentOne)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 2)

        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, mockTextDocumentTwo)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 2)

        const managedVisualizations = aslVisualizationManager.getManagedVisualizations()
        assert.ok(managedVisualizations.get(mockTextDocumentOne.uri.fsPath))
        assert.ok(managedVisualizations.get(mockTextDocumentTwo.uri.fsPath))
    })

    it('Test AslVisualizationManager managedVisualizations set removes visualization on visualization dispose, single vis', async function () {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        let panel = await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, mockTextDocumentOne)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

        // Dispose of visualization panel
        assert.ok(panel, 'Panel was not successfully generated')
        panel = panel as vscode.WebviewPanel
        panel.dispose()

        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)
    })

    it('Test AslVisualizationManager managedVisualizations set removes correct visualization on visualization dispose, multiple vis', async function () {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        let panel = await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, mockTextDocumentOne)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, mockTextDocumentTwo)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 2)

        // Dispose of first visualization panel
        assert.ok(panel, 'Panel was not successfully generated')
        panel = panel as vscode.WebviewPanel
        panel.dispose()

        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)
    })

    it('Test AslVisualisation sendUpdateMessage posts a correct update message for YAML files', async function () {
        const postMessage = sinon.spy()
        class MockAslVisualizationYaml extends AslVisualization {
            public getWebview(): vscode.Webview | undefined {
                return { postMessage } as unknown as vscode.Webview
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

    it('Test AslVisualisation sendUpdateMessage posts a correct update message for ASL files', async function () {
        const postMessage = sinon.spy()
        class MockAslVisualizationJson extends AslVisualization {
            public getWebview(): vscode.Webview | undefined {
                return { postMessage } as unknown as vscode.Webview
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
