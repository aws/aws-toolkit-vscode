/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'

import { AslVisualizationCDK } from '../../../../cdk/commands/aslVisualizationCDK'
import { AslVisualizationCDKManager, getCDKAppWorkspaceName } from '../../../../cdk/commands/aslVisualizationCDKManager'
import { ConstructNode, isStateMachine } from '../../../../cdk/explorer/nodes/constructNode'
import { ConstructTreeEntity } from '../../../../cdk/explorer/tree/types'
import { Disposable } from 'vscode-languageclient'
import { ext } from '../../../../shared/extensionGlobals'
import { FakeParentNode } from '../constructNode.test'
import { getLogger, Logger } from '../../../../shared/logger'
import { StateMachineGraphCache } from '../../../../stepFunctions/utils'

// Top level defintions
let mockAslVisualizationCDKManager: MockAslVisualizationCDKManager
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

const mockUriTwo: vscode.Uri = {
    authority: 'amazon.com',
    fragment: 'MockFragmentTwo',
    fsPath: 'MockFSPathTwo',
    query: 'MockQueryTwo',
    path: '/MockPathTwo',
    scheme: 'MockSchemeTwo',
    with: () => {
        return mockUriTwo
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

const mockDataJson =
    '{"Comment":"A Hello World example of the Amazon States Language using Pass states","StartAt":"Hello","States":{"Hello":{"Type":"Pass","Result":"Hello","Next":"World"},"World":{"Type":"Pass","Result":"${Text}","End":true}}}'

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

const mockNonSMConstructTreeEntity: ConstructTreeEntity = {
    id: 'MyLambdaFunction',
    path: 'aws-tester/MyLambdaFunction',
    children: {
        'Resource': {
            id: 'Resource',
            path: 'aws-tester/MyLambdaFunction/Resource',
            attributes: {
                "aws:cdk:cloudformation:type": 'AWS::StepFunctions::LambdaFunction'
            }
        }
    }
}

const mockNonConstructNode = new ConstructNode(
    new FakeParentNode('cdkJsonPath'),
    'MyCDKApp1/MyLambdaFunction',
    vscode.TreeItemCollapsibleState.Collapsed,
    mockNonSMConstructTreeEntity
)

const mockStateMachineConstructTreeEntity: ConstructTreeEntity = {
    id: 'MyStateMachine',
    path: 'aws-tester/MyStateMachine',
    children: {
        'Resource': {
            id: 'Resource',
            path: 'aws-tester/MyStateMachine/Resource',
            attributes: {
                "aws:cdk:cloudformation:type": 'AWS::StepFunctions::StateMachine'
            }
        }
    }
}

const mockStateMachineNode = new ConstructNode(
    new FakeParentNode('cdkJsonPath'),
    'MyCDKApp1/MyStateMachine',
    vscode.TreeItemCollapsibleState.Collapsed,
    mockStateMachineConstructTreeEntity
)

const mockStateMachineNodeSameName = new ConstructNode(
    new FakeParentNode('cdkJsonPath'),
    'MyCDKApp2/MyStateMachine',
    vscode.TreeItemCollapsibleState.Collapsed,
    mockStateMachineConstructTreeEntity
)

const mockStateMachineNode2 = new ConstructNode(
    new FakeParentNode('cdkJsonPath'),
    'MyCDKApp1/MyStateMachine2',
    vscode.TreeItemCollapsibleState.Collapsed,
    mockStateMachineConstructTreeEntity
)

describe('StepFunctions VisualizeStateMachine', async function () {
    const oldWebviewScriptsPath = ext.visualizationResourcePaths.localWebviewScriptsPath
    const oldWebviewBodyPath = ext.visualizationResourcePaths.webviewBodyScript
    const oldCachePath = ext.visualizationResourcePaths.visualizationLibraryCachePath
    const oldScriptPath = ext.visualizationResourcePaths.visualizationLibraryScript
    const oldCssPath = ext.visualizationResourcePaths.visualizationLibraryCSS
    const oldThemePath = ext.visualizationResourcePaths.stateMachineCustomThemePath
    const oldThemeCssPath = ext.visualizationResourcePaths.stateMachineCustomThemeCSS

    // Before all
    before(function () {
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
    beforeEach(function () {
        mockAslVisualizationCDKManager = new MockAslVisualizationCDKManager(mockExtensionContext)
        //mockAslVisualizationCDKManager = new MockAslVisualizationCDKManager(mockExtensionContext,mockTextDocumentOne)
    })

    // After each
    afterEach(function () {
    })

    // After all
    after(function () {
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
    it('Test AslVisualizationCDK on setup all properties are correct', function () {
        const vis = new MockAslVisualizationCDK(mockTextDocumentOne, '', '', '')

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

    it('Test AslVisualizationCDKManager on setup managedVisualizationsCDK set is empty', function () {
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 0)
    })

    it('Test AslVisualizationCDKManager managedVisualizationsCDK set still empty if node is not of type state machine', async function () {
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 0)

        // Preview with non state machine node
        assert.strictEqual(await mockAslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage, mockNonConstructNode), undefined)
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 0)
    })

    it('Test AslVisualizationCDKManager managedVisualizationsCDK set has one AslVisCDK on first visualization', async function () {
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 0)

        assert.ok(await mockAslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage, mockStateMachineNode))
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 1)
    })

    it('Test AslVisualizationCDKManager managedVisualizationsCDK set does not add second VisCDK on duplicate state machine node', async function () {
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 0)

        // visualization for mockStateMachineNode
        await mockAslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage, mockStateMachineNode)
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 1)

        // visualization for the same mockStateMachineNode
        await mockAslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage, mockStateMachineNode)
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 1)
    })

    it('Test AslVisualizationCDKManager managedVisualizationsCDK set adds second VisCDK on different state machine nodes', async function () {
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 0)

        // visualization for mockStateMachineNode
        await mockAslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage, mockStateMachineNode)
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 1)

        // visualization for mockStateMachineNode2
        await mockAslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage, mockStateMachineNode2)

        await mockAslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage, mockStateMachineNode2)
        await mockAslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage, mockStateMachineNode)
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 2)
    })

    it('Test AslVisualizationCDKManager managedVisualizationsCDK set does not add duplicate renders when multiple VisCDK active', async function () {
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 0)

        // visualization for mockStateMachineNode
        await mockAslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage, mockStateMachineNode)
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 1)

        // visualization for mockStateMachineNode2
        await mockAslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage, mockStateMachineNode2)
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 2)

        // visualization for mockStateMachineNode again
        await mockAslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage, mockStateMachineNode)
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 2)

        // visualization for mockStateMachineNode2 again
        await mockAslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage, mockStateMachineNode2)
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 2)
    })

    it('Test AslVisualizationCDKManager managedVisualizationsCDK set allows multiple VisCDK with the same cdk application name with different identifiers', async function () {

    })

    it('Test AslVisualizationCDKManager managedVisualizationsCDK set allows multiple VisCDK with the same identifier with different cdk application names', async function () {
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 0)

        // visualization for mockStateMachineNode
        await mockAslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage, mockStateMachineNode)
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 1)

        //mockAslVisualizationCDKManager.setAppName('cdkAppName2')
        await mockAslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage, mockStateMachineNodeSameName)
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 2)
        //assert.strictEqual(mockStateMachineNode.id,'hello')
    })

    it('Test AslVisualizationCDKManager managedVisualizationsCDK set removes visualization on removal of template.json file, single visCDK', async function () {
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 0)
    })

    it('Test AslVisualizationCDKManager managedVisualizationsCDK set removes correct visualization on removal of template.json file, multiple vis', async function () {
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 0)
    })

    it('Test AslVisualisationCDK sendUpdateMessage posts a correct update message for ASL files', async function () {
    })
})

class MockAslVisualizationCDK extends AslVisualizationCDK {
    protected getText(textDocument: vscode.TextDocument): string {
        return mockDataJson
    }

    protected getTemplateJsonDocument(templatePath: string) {
        return mockUriOne
    }

    public getIsPanelDisposed(): boolean {
        return this.isPanelDisposed
    }

    public getDisposables(): Disposable[] {
        return this.disposables
    }
}

class MockAslVisualizationCDKManager extends AslVisualizationCDKManager {
    // public mockTextDocument: vscode.TextDocument
    public workspaceName: string = "CDKWorkspace"

    public async visualizeStateMachine(
        globalStorage: vscode.Memento,
        node: ConstructNode,
    ): Promise<vscode.WebviewPanel | undefined> {
        if (!isStateMachine(node.construct)) {
            return
        }

        const logger: Logger = getLogger()
        const uniqueIdentifier = node.label
        const stateMachineName = uniqueIdentifier.substring(uniqueIdentifier.lastIndexOf("/") + 1, uniqueIdentifier.length)
        //const cdkOutPath = node.id?.replace(`/tree.json/${node.tooltip}`, ``)
        //const stackName = node.tooltip?.replace(`/${uniqueIdentifier}`, ``)
        //const templatePath = String(cdkOutPath) + `/${stackName}.template.json`
        const templatePath = 'templatePath'
        //const appName = getCDKAppWorkspaceName(cdkOutPath!)
        console.log("Unique Identifier: " + uniqueIdentifier)
        console.log("SMName: " + stateMachineName)
        const existingVisualization = this.getExistingVisualization(this.workspaceName, uniqueIdentifier)

        if (existingVisualization) {
            console.log('exists!!')
            existingVisualization.showPanel()

            return existingVisualization.getPanel()
        }

        // Existing visualization does not exist, construct new visualization
        try {
            console.log('does not exist')
            const newVisualization = new MockAslVisualizationCDK(mockTextDocumentOne, templatePath, uniqueIdentifier, stateMachineName)
            if (newVisualization) {
                this.handleNewVisualization(this.workspaceName, newVisualization)
                return newVisualization.getPanel()
            }
        } catch (err) {
            this.handleErr(err, logger)
        }

        return
    }
}