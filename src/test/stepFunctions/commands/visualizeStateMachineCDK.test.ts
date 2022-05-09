/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'

import { AslVisualizationCDK } from '../../../stepFunctions/commands/visualizeStateMachine/aslVisualizationCDK'
import { AslVisualizationCDKManager } from '../../../stepFunctions/commands/visualizeStateMachine/aslVisualizationCDKManager'
import { ConstructNode, isStateMachine } from '../../../cdk/explorer/nodes/constructNode'
import { ConstructTreeEntity } from '../../../cdk/explorer/tree/types'
import { Disposable } from 'vscode-languageclient'
import { FakeParentNode } from '../../cdk/explorer/constructNode.test'
import { getLogger, Logger } from '../../../shared/logger'
import { StateMachineGraphCache } from '../../../stepFunctions/utils'
import globals from '../../../shared/extensionGlobals'
import { FakeExtensionContext } from '../../fakeExtensionContext'

// Top level defintions
let mockAslVisualizationCDKManager: MockAslVisualizationCDKManager
let sandbox: sinon.SinonSandbox

const mockGlobalStorage: vscode.Memento = {
    update: sinon.spy(),
    get: sinon.stub().returns(undefined),
}

const mockUri: vscode.Uri = {
    authority: 'amazon.com',
    fragment: 'MockFragmentOne',
    fsPath: 'MockFSPathOne',
    query: 'MockQueryOne',
    path: '/MockPathOne',
    scheme: 'MockSchemeOne',
    with: () => {
        return mockUri
    },
    toJSON: sinon.spy(),
}

const mockTextDocument: vscode.TextDocument = {
    eol: 1,
    fileName: 'MockFileNameOne',
    isClosed: false,
    isDirty: false,
    isUntitled: false,
    languageId: 'MockLanguageIdOne',
    lineCount: 0,
    uri: mockUri,
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

const mockJsonData =
    '{"Comment":"A Hello World example of the Amazon States Language using Pass states","StartAt":"Hello","States":{"Hello":{"Type":"Pass","Result":"Hello","Next":"World"},"World":{"Type":"Pass","Result":"${Text}","End":true}}}'

const mockNonSMConstructTreeEntity: ConstructTreeEntity = {
    id: 'MyLambdaFunction',
    path: 'aws-tester/MyLambdaFunction',
    children: {
        Resource: {
            id: 'Resource',
            path: 'aws-tester/MyLambdaFunction/Resource',
            attributes: {
                'aws:cdk:cloudformation:type': 'AWS::StepFunctions::LambdaFunction',
            },
        },
    },
}

const mockStateMachineConstructTreeEntity: ConstructTreeEntity = {
    id: 'MyStateMachine',
    path: 'aws-tester/MyStateMachine',
    children: {
        Resource: {
            id: 'Resource',
            path: 'aws-tester/MyStateMachine/Resource',
            attributes: {
                'aws:cdk:cloudformation:type': 'AWS::StepFunctions::StateMachine',
            },
        },
    },
}

const mockNonStateMachineNode = new ConstructNode(
    new FakeParentNode('cdkJsonPath'),
    'MyCDKApp1/MyLambdaFunction',
    vscode.TreeItemCollapsibleState.Collapsed,
    mockNonSMConstructTreeEntity
)

const mockStateMachineNode = new ConstructNode(
    new FakeParentNode('cdkJsonPath'),
    'MyCDKApp1/MyStateMachine',
    vscode.TreeItemCollapsibleState.Collapsed,
    mockStateMachineConstructTreeEntity
)

const mockStateMachineNodeDiffAppSameName = new ConstructNode(
    new FakeParentNode('cdkJsonPath'),
    'MyCDKApp2/MyStateMachine',
    vscode.TreeItemCollapsibleState.Collapsed,
    mockStateMachineConstructTreeEntity
)

const mockStateMachineNodeSameAppDiffName = new ConstructNode(
    new FakeParentNode('cdkJsonPath'),
    'MyCDKApp1/MyStateMachine2',
    vscode.TreeItemCollapsibleState.Collapsed,
    mockStateMachineConstructTreeEntity
)

describe('StepFunctions VisualizeStateMachine', async function () {
    const oldWebviewScriptsPath = globals.visualizationResourcePaths.localWebviewScriptsPath
    const oldWebviewBodyPath = globals.visualizationResourcePaths.webviewBodyScript
    const oldCachePath = globals.visualizationResourcePaths.visualizationLibraryCachePath
    const oldScriptPath = globals.visualizationResourcePaths.visualizationLibraryScript
    const oldCssPath = globals.visualizationResourcePaths.visualizationLibraryCSS
    const oldThemePath = globals.visualizationResourcePaths.stateMachineCustomThemePath
    const oldThemeCssPath = globals.visualizationResourcePaths.stateMachineCustomThemeCSS

    // Before all
    before(function () {
        globals.visualizationResourcePaths.localWebviewScriptsPath = mockUri
        globals.visualizationResourcePaths.visualizationLibraryCachePath = mockUri
        globals.visualizationResourcePaths.stateMachineCustomThemePath = mockUri
        globals.visualizationResourcePaths.webviewBodyScript = mockUri
        globals.visualizationResourcePaths.visualizationLibraryScript = mockUri
        globals.visualizationResourcePaths.visualizationLibraryCSS = mockUri
        globals.visualizationResourcePaths.stateMachineCustomThemeCSS = mockUri

        sandbox = sinon.createSandbox()
        sandbox.stub(StateMachineGraphCache.prototype, 'updateCachedFile').callsFake(async options => {
            return
        })
    })

    // Before each
    beforeEach(async function () {
        const fakeExtCtx = await FakeExtensionContext.create()
        fakeExtCtx.globalState = mockGlobalStorage
        fakeExtCtx.workspaceState = mockGlobalStorage
        fakeExtCtx.asAbsolutePath = sinon.spy()
        mockAslVisualizationCDKManager = new MockAslVisualizationCDKManager(fakeExtCtx, 'Workspace1')
    })

    // After all
    after(function () {
        sandbox.restore()
        globals.visualizationResourcePaths.localWebviewScriptsPath = oldWebviewScriptsPath
        globals.visualizationResourcePaths.webviewBodyScript = oldWebviewBodyPath
        globals.visualizationResourcePaths.visualizationLibraryCachePath = oldCachePath
        globals.visualizationResourcePaths.visualizationLibraryScript = oldScriptPath
        globals.visualizationResourcePaths.visualizationLibraryCSS = oldCssPath
        globals.visualizationResourcePaths.stateMachineCustomThemePath = oldThemePath
        globals.visualizationResourcePaths.stateMachineCustomThemeCSS = oldThemeCssPath
    })

    // Tests
    it('Test AslVisualizationCDK on setup all properties are correct', function () {
        const vis = new MockAslVisualizationCDK(mockTextDocument, '', '', '')

        assert.deepStrictEqual(vis.documentUri, mockTextDocument.uri)
        assert.strictEqual(vis.getIsPanelDisposed(), false)
        assert.strictEqual(vis.getDisposables().length, 5)

        const panel = vis.getPanel() as vscode.WebviewPanel
        assert.ok(panel)
        assert.ok(panel.title.length > 0)
        assert.strictEqual(panel.viewType, 'stateMachineVisualization')

        let webview = vis.getWebview()
        webview = webview as vscode.Webview
        assert.ok(webview)
        assert.ok(webview.html)
    })

    it('Test AslVisualizationCDKManager on setup managedVisualizationsCDK set is empty', function () {
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 0)
    })

    it('Test AslVisualizationCDKManager managedVisualizationsCDK set still empty if node is not of type state machine', async function () {
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 0)

        // Preview with non state machine node
        assert.strictEqual(
            await mockAslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage, mockNonStateMachineNode),
            undefined
        )
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

    it('Test AslVisualizationCDKManager managedVisualizationsCDK set adds second VisCDK on different state machine nodes (same workspace, same cdk application name with different state machine names)', async function () {
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 0)

        // visualization for mockStateMachineNode
        await mockAslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage, mockStateMachineNode)
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 1)

        // visualization for mockStateMachineNode2
        await mockAslVisualizationCDKManager.visualizeStateMachine(
            mockGlobalStorage,
            mockStateMachineNodeSameAppDiffName
        )
        assert.strictEqual(
            mockAslVisualizationCDKManager
                .getManagedVisualizations()
                .get(mockAslVisualizationCDKManager.getWorkspaceName())?.size,
            2
        )
    })

    it('Test AslVisualizationCDKManager managedVisualizationsCDK set adds second VisCDK on different state machine nodes (same workspace, different cdk application names with same state machine name)', async function () {
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 0)

        // visualization for mockStateMachineNode
        await mockAslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage, mockStateMachineNode)
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 1)

        // visualization for mockStateMachineNode2
        await mockAslVisualizationCDKManager.visualizeStateMachine(
            mockGlobalStorage,
            mockStateMachineNodeDiffAppSameName
        )
        assert.strictEqual(
            mockAslVisualizationCDKManager
                .getManagedVisualizations()
                .get(mockAslVisualizationCDKManager.getWorkspaceName())?.size,
            2
        )
    })

    it('Test AslVisualizationCDKManager managedVisualizationsCDK set adds second VisCDK on different state machine nodes (different workspaces, same cdk application name with same state machine name)', async function () {
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 0)

        // visualization for mockStateMachineNode
        await mockAslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage, mockStateMachineNode)
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 1)

        //change workspace
        mockAslVisualizationCDKManager.setWorkspaceName('Workspace2')
        // visualization for mockStateMachineNode2
        await mockAslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage, mockStateMachineNode)
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 2)
    })

    it('Test AslVisualizationCDKManager managedVisualizationsCDK set does not add duplicate renders when multiple VisCDK active', async function () {
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 0)

        // visualization for mockStateMachineNode
        await mockAslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage, mockStateMachineNode)
        assert.strictEqual(mockAslVisualizationCDKManager.getManagedVisualizations().size, 1)

        // visualization for mockStateMachineNode2
        await mockAslVisualizationCDKManager.visualizeStateMachine(
            mockGlobalStorage,
            mockStateMachineNodeSameAppDiffName
        )
        assert.strictEqual(
            mockAslVisualizationCDKManager
                .getManagedVisualizations()
                .get(mockAslVisualizationCDKManager.getWorkspaceName())?.size,
            2
        )

        // visualization for mockStateMachineNode again
        await mockAslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage, mockStateMachineNode)
        assert.strictEqual(
            mockAslVisualizationCDKManager
                .getManagedVisualizations()
                .get(mockAslVisualizationCDKManager.getWorkspaceName())?.size,
            2
        )

        // visualization for mockStateMachineNode2 again
        await mockAslVisualizationCDKManager.visualizeStateMachine(
            mockGlobalStorage,
            mockStateMachineNodeSameAppDiffName
        )
        assert.strictEqual(
            mockAslVisualizationCDKManager
                .getManagedVisualizations()
                .get(mockAslVisualizationCDKManager.getWorkspaceName())?.size,
            2
        )
    })
})

class MockAslVisualizationCDK extends AslVisualizationCDK {
    protected getText(textDocument: vscode.TextDocument): string {
        return mockJsonData
    }

    protected getTemplateJsonDocument(templatePath: string): vscode.Uri {
        return mockUri
    }

    public getIsPanelDisposed(): boolean {
        return this.isPanelDisposed
    }

    public getDisposables(): Disposable[] {
        return this.disposables
    }
}

class MockAslVisualizationCDKManager extends AslVisualizationCDKManager {
    protected workspaceName: string

    constructor(extensionContext: vscode.ExtensionContext, workspaceName: string) {
        super(extensionContext)
        this.workspaceName = workspaceName
    }

    public getWorkspaceName(): string {
        return this.workspaceName
    }

    public setWorkspaceName(workspaceName: string): void {
        this.workspaceName = workspaceName
    }

    public async visualizeStateMachine(
        globalStorage: vscode.Memento,
        node: ConstructNode
    ): Promise<vscode.WebviewPanel | undefined> {
        if (!isStateMachine(node.construct)) {
            return
        }

        const logger: Logger = getLogger()
        const uniqueIdentifier = node.label
        const stateMachineName = uniqueIdentifier.substring(
            uniqueIdentifier.lastIndexOf('/') + 1,
            uniqueIdentifier.length
        )
        const templatePath = 'templatePath'
        const existingVisualization = this.getExistingVisualization(this.workspaceName, uniqueIdentifier)

        if (existingVisualization) {
            existingVisualization.showPanel()

            return existingVisualization.getPanel()
        }

        // If existing visualization does not exist, construct new visualization
        try {
            const newVisualization = new MockAslVisualizationCDK(
                mockTextDocument,
                templatePath,
                uniqueIdentifier,
                stateMachineName
            )
            if (newVisualization) {
                this.handleNewVisualization(this.workspaceName, newVisualization)
                return newVisualization.getPanel()
            }
        } catch (err) {
            this.handleErr(err as Error, logger)
        }

        return
    }
}
