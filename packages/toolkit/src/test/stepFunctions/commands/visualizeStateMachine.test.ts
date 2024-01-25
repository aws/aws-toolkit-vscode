/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { Disposable } from 'vscode-languageclient'
import { AslVisualization } from '../../../../src/stepFunctions/commands/visualizeStateMachine/aslVisualization'
import { AslVisualizationManager } from '../../../../src/stepFunctions/commands/visualizeStateMachine/aslVisualizationManager'

import { StateMachineGraphCache } from '../../../stepFunctions/utils'

import { YAML_ASL, JSON_ASL } from '../../../../src/stepFunctions/constants/aslFormats'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import { closeAllEditors } from '../../testUtil'
import { getLogger } from '../../../shared/logger'
import { previewStateMachineCommand } from '../../../stepFunctions/activation'
import { getTestWindow } from '../../shared/vscode/window'

// Top level defintions
let aslVisualizationManager: AslVisualizationManager

const mockGlobalStorage: vscode.Memento & { setKeysForSync(keys: readonly string[]): void } = {
    keys: () => [],
    setKeysForSync: (keys: readonly string[]) => undefined,
    update: sinon.spy(),
    get: sinon.stub().returns(undefined),
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

describe('StepFunctions VisualizeStateMachine', async function () {
    async function getDocument(content = '', language?: string): Promise<vscode.TextDocument> {
        return await vscode.workspace.openTextDocument({ content, language })
    }

    const getDoc1 = () => getDocument('TextOne', 'IdOne')
    const getDoc2 = () => getDocument('TextTwo', 'IdTwo')
    const getYamlDoc = () => getDocument(mockDataYaml, YAML_ASL)
    const getJsonDoc = () => getDocument(mockDataJson, JSON_ASL)

    before(function () {
        sinon.stub(StateMachineGraphCache.prototype, 'updateCachedFile').resolves()
    })

    beforeEach(async function () {
        const fakeExtCtx = await FakeExtensionContext.create()
        fakeExtCtx.globalState = mockGlobalStorage
        fakeExtCtx.workspaceState = mockGlobalStorage
        aslVisualizationManager = new AslVisualizationManager(fakeExtCtx)
    })

    after(async function () {
        sinon.restore()
        await closeAllEditors().catch(e => getLogger().warn(`closeAllEditors failed: ${e}`))
    })

    it('Test AslVisualization on setup all properties are correct', async function () {
        const doc = await getDoc1()
        const vis = new MockAslVisualization(doc)

        assert.deepStrictEqual(vis.documentUri, doc.uri)
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
        const doc = await getDoc1()
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, doc)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

        const managedVisualizations = aslVisualizationManager.getManagedVisualizations()
        assert.ok(managedVisualizations.get(doc.uri.fsPath))
    })

    it('Test AslVisualizationManager managedVisualizations set does not add second Vis on duplicate preview', async function () {
        const doc = await getDoc1()
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, doc)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, doc)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

        const managedVisualizations = aslVisualizationManager.getManagedVisualizations()
        assert.ok(managedVisualizations.get(doc.uri.fsPath))
    })

    it('Test AslVisualizationManager managedVisualizations set adds second Vis on different preview', async function () {
        const doc1 = await getDoc1()
        const doc2 = await getDoc2()

        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, doc1)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, doc2)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 2)

        const managedVisualizations = aslVisualizationManager.getManagedVisualizations()
        assert.ok(managedVisualizations.get(doc1.uri.fsPath))
        assert.ok(managedVisualizations.get(doc2.uri.fsPath))
    })

    it('Test AslVisualizationManager managedVisualizations set does not add duplicate renders when multiple Vis active', async function () {
        const doc1 = await getDoc1()
        const doc2 = await getDoc2()

        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, doc1)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, doc2)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 2)

        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, doc1)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 2)

        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, doc2)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 2)

        const managedVisualizations = aslVisualizationManager.getManagedVisualizations()
        assert.ok(managedVisualizations.get(doc1.uri.fsPath))
        assert.ok(managedVisualizations.get(doc2.uri.fsPath))
    })

    it('Test AslVisualizationManager managedVisualizations set removes visualization on visualization dispose, single vis', async function () {
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        let panel = await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, await getDoc1())
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

        // Dispose of visualization panel
        assert.ok(panel, 'Panel was not successfully generated')
        panel = panel as vscode.WebviewPanel
        panel.dispose()

        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)
    })

    it('Test AslVisualizationManager managedVisualizations set removes correct visualization on visualization dispose, multiple vis', async function () {
        const doc1 = await getDoc1()
        const doc2 = await getDoc2()

        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 0)

        let panel = await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, doc1)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)

        await aslVisualizationManager.visualizeStateMachine(mockGlobalStorage, doc2)
        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 2)

        // Dispose of first visualization panel
        assert.ok(panel, 'Panel was not successfully generated')
        panel = panel as vscode.WebviewPanel
        panel.dispose()

        assert.strictEqual(aslVisualizationManager.getManagedVisualizations().size, 1)
    })

    it('throws an error if no active text editor is open', async function () {
        // Make sure nothing is open from previous tests.
        await closeAllEditors()
        assert.strictEqual(vscode.window.activeTextEditor, undefined)

        const errorMessage = getTestWindow().waitForMessage(/no active text editor/i)

        await Promise.all([previewStateMachineCommand.execute(), errorMessage.then(dialog => dialog.close())])
    })

    it('Test AslVisualisation sendUpdateMessage posts a correct update message for YAML files', async function () {
        const yamlDoc = await getYamlDoc()
        const postMessage = sinon.spy()
        class MockAslVisualizationYaml extends AslVisualization {
            public override getWebview(): vscode.Webview | undefined {
                return { postMessage } as unknown as vscode.Webview
            }
        }

        const visualisation = new MockAslVisualizationYaml(yamlDoc)

        await visualisation.sendUpdateMessage(yamlDoc)

        const message = {
            command: 'update',
            stateMachineData: mockDataJson,
            isValid: true,
        }

        assert.ok(postMessage.calledOnce)
        assert.deepEqual(postMessage.firstCall.args, [message])
    })

    it('Test AslVisualisation sendUpdateMessage posts a correct update message for invalid YAML files', async function () {
        const yamlDoc = await getDocument(mockDataYaml.replace('StartAt:', ']StartAt:'), YAML_ASL)
        const postMessage = sinon.spy()
        class MockAslVisualizationYaml extends AslVisualization {
            public override getWebview(): vscode.Webview | undefined {
                return { postMessage } as unknown as vscode.Webview
            }
        }

        const visualisation = new MockAslVisualizationYaml(yamlDoc)

        await visualisation.sendUpdateMessage(yamlDoc)

        const message = {
            command: 'update',
            stateMachineData: undefined,
            isValid: false,
        }

        assert.ok(postMessage.calledOnce)
        assert.deepEqual(postMessage.firstCall.args, [message])
    })

    it('Test AslVisualisation sendUpdateMessage posts a correct update message for ASL files', async function () {
        const jsonDoc = await getJsonDoc()
        const postMessage = sinon.spy()
        class MockAslVisualizationJson extends AslVisualization {
            public override getWebview(): vscode.Webview | undefined {
                return { postMessage } as unknown as vscode.Webview
            }
        }

        const visualisation = new MockAslVisualizationJson(jsonDoc)

        await visualisation.sendUpdateMessage(jsonDoc)

        const message = {
            command: 'update',
            stateMachineData: mockDataJson,
            isValid: true,
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
