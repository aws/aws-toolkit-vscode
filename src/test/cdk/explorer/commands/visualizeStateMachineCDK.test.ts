/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { AslVisualizationCDKManager } from '../../../../../src/cdk/commands/aslVisualizationCDKManager'
import { ext } from '../../../../shared/extensionGlobals'
import { StateMachineGraphCache } from '../../../../stepFunctions/utils'
import { ConstructNode } from '../../../../../src/cdk/explorer/nodes/constructNode'
import { AWSTreeNodeBase } from '../../../../../src/shared/treeview/nodes/awsTreeNodeBase'
import { ConstructTreeEntity } from '../../../../../src/cdk/explorer/tree/types'
import { AslVisualizationCDK } from '../../../../../src/cdk/commands/aslVisualizationCDK'

// Top level defintions
let aslVisualizationCDKManager: AslVisualizationCDKManager
let sandbox: sinon.SinonSandbox

const mockGlobalStorage: vscode.Memento = {
    update: sinon.spy(),
    get: sinon.stub().returns(undefined),
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

export class FakeParentNode extends AWSTreeNodeBase {
    public constructor(label: string) {
        super(label)
        this.id = label
    }
}

//const mockAWSTreeNodeBase = new AWSTreeNodeBase('TesterTreeNodeBase',vscode.TreeItemCollapsibleState.Collapsed)
const mockSMConstructTreeEntity: ConstructTreeEntity = {
    id: 'MyStateMachine',
    path: 'aws-tester/MyStateMachine',
    children: { 'Resource' : {
                    id: 'Resource',
                    path: 'aws-tester/MyStateMachine/Resource',
                    attributes: {
                        "aws:cdk:cloudformation:type": 'AWS::StepFunctions::StateMachine'
                    }
                }
              }
}

const mockNonSMConstructTreeEntity: ConstructTreeEntity = {
    id: 'MyLambdaFunction',
    path: 'aws-tester/MyLambdaFunction',
    children: { 'Resource' : {
                    id: 'Resource',
                    path: 'aws-tester/MyLambdaFunction/Resource',
                    attributes: {
                        "aws:cdk:cloudformation:type": 'AWS::StepFunctions::LambdaFunction'
                    }
                }
              }
}

const label = 'MyStateMachine'
const cdkJsonPath = path.join('the', 'road', 'to', 'cdk.json')
const mockDataJson = `{"StartAt":"Submit Job","States":{"Submit Job":{"Next":"Wait X Seconds","Type":"Task","Resource":"SubmitJobFB773A16","ResultPath":"$.guid"},"Wait X Seconds":{"Type":"Wait","SecondsPath":"$.wait_time","Next":"Get Job Status"},"Get Job Status":{"Next":"Job Complete?","InputPath":"$.guid","Type":"Task","Resource":"CheckJob5FFC1D6F","ResultPath":"$.status"},"Job Complete?":{"Type":"Choice","Choices":[{"Variable":"$.status","StringEquals":"FAILED","Next":"Job Failed"},{"Variable":"$.status","StringEquals":"SUCCEEDED","Next":"Get Final Job Status"}],"Default":"Wait X Seconds"},"Job Failed":{"Type":"Fail","Error":"DescribeJob returned FAILED","Cause":"AWS Batch Job Failed"},"Get Final Job Status":{"End":true,"InputPath":"$.guid","Type":"Task","Resource":"CheckJob5FFC1D6F"}},"TimeoutSeconds":30}`
const mockDataJsonWrongFormat = '{"Comment":"A Hello World example of the Amazon States Language using Pass states","StartAt":"Hello","States":{"Hello":{"Type":"Pass","Result":"Hello","Next":"World"},"World":{"Type":"Pass","Result":"${Text}","End":true'

const mockStateMachineNode = new ConstructNode(
    new FakeParentNode(cdkJsonPath),
    label,
    vscode.TreeItemCollapsibleState.Collapsed,
    mockSMConstructTreeEntity
)

//need to change this so that it is different from mockConstructNode
const mockConstructNode2 = new ConstructNode(
    new FakeParentNode(cdkJsonPath),
    label,
    vscode.TreeItemCollapsibleState.Collapsed,
    mockNonSMConstructTreeEntity
)
//const mockConstructNode = new ConstructNode(new FakeParentNode('fakeParentNode'),'MyStateMachine',vscode.TreeItemCollapsibleState.Collapsed,mockConstruct)

const mockAslVisualizationCDK = new AslVisualizationCDK('','')

var stub = sinon.createStubInstance(AslVisualizationCDKManager, {
    visualizeStateMachine:
  });

//const MockAslVisualizeStateMachineCDKManager : AslVisualizationCDKManager = sinon.spy()

// class MockAslVisualizeStateMachineCDKManager extends AslVisualizationCDKManager{
//     public override visualizeStateMachine(
//         globalStorage: vscode.Memento,
//         node: ConstructNode
//     ): Promise<vscode.WebviewPanel | undefined>{
//         // Attempt to retrieve existing visualization if it exists.
//         const existingVisualization = this.getExistingVisualization(node.label)
//         if (existingVisualization) {
//             return existingVisualization?.getPanel()
//         }

//         // Existing visualization does not exist, construct new visualization
//         try {
//             const newVisualization = mockAslVisualizationCDK
//             if (newVisualization) {
//                 this.handleNewVisualization(node.label, newVisualization)
//                 return newVisualization.getPanel()?
//             }
//         } catch (err) {
//                 console.log(err)
//         }
//         return undefined
//     }
// }

describe('StepFunctions VisualizeStateMachine', async function () {
    //let mockConstructNode: MockConstructNode

    const oldWebviewScriptsPath = ext.visualizationResourcePaths.localWebviewScriptsPath
    const oldWebviewBodyPath = ext.visualizationResourcePaths.webviewBodyScript
    const oldCachePath = ext.visualizationResourcePaths.visualizationLibraryCachePath
    const oldScriptPath = ext.visualizationResourcePaths.visualizationLibraryScript
    const oldCssPath = ext.visualizationResourcePaths.visualizationLibraryCSS
    const oldThemePath = ext.visualizationResourcePaths.stateMachineCustomThemePath
    const oldThemeCssPath = ext.visualizationResourcePaths.stateMachineCustomThemeCSS

    // Before all
    before(function () {
        //mockConstructNode = new MockConstructNode()

        sandbox = sinon.createSandbox()
        sandbox.stub(StateMachineGraphCache.prototype, 'updateCachedFile').callsFake(async options => {
            return
        })
    })

    // Before each
    beforeEach(function () {
        // aslVisualizationCDKManager = new MockAslVisualizeStateMachineCDKManager(mockExtensionContext)
        aslVisualizationCDKManager = new AslVisualizationCDKManager(mockExtensionContext)
    })

    // After each
    afterEach(function () {
        //mockConstructNode.closeAll()
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
    it('Test AslVisualization on setup all properties are correct', function () {
    })

    it('Test AslVisualizationCDKManager on setup managedVisualizations set is empty', function () {
        assert.strictEqual(aslVisualizationCDKManager.getManagedVisualizations().size, 0)
    })

    it('Test AslVisualizationCDKManager managedVisualizations set still empty if NonStateMachineNode', async function () {
        assert.strictEqual(aslVisualizationCDKManager.getManagedVisualizations().size, 0)

        // Preview with non-state machine node

        assert.strictEqual(aslVisualizationCDKManager.getManagedVisualizations().size, 0)
    })

    it('Test AslVisualizationCDKManager managedVisualizations set has one AslVis on first preview', async function () {   
        assert.strictEqual(aslVisualizationCDKManager.getManagedVisualizations().size, 0)
        
        //render graph
        aslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage,mockStateMachineNode)
        assert.strictEqual(aslVisualizationCDKManager.getManagedVisualizations().size, 1)
    })

    it('Test AslVisualizationCDKManager managedVisualizations set does not add second Vis on duplicate preview', async function () {
        assert.strictEqual(aslVisualizationCDKManager.getManagedVisualizations().size, 0)
        
        //render graph
        aslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage,mockStateMachineNode)
        assert.strictEqual(aslVisualizationCDKManager.getManagedVisualizations().size, 1)
        aslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage,mockStateMachineNode)
        assert.strictEqual(aslVisualizationCDKManager.getManagedVisualizations().size, 1)
    })

    it('Test AslVisualizationCDKManager managedVisualizations set adds second Vis on different preview', async function () {
        assert.strictEqual(aslVisualizationCDKManager.getManagedVisualizations().size, 0)
        
        //render graph
        aslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage,mockStateMachineNode)
        assert.strictEqual(aslVisualizationCDKManager.getManagedVisualizations().size, 1)
        aslVisualizationCDKManager.visualizeStateMachine(mockGlobalStorage,mockStateMachineNode2)
        assert.strictEqual(aslVisualizationCDKManager.getManagedVisualizations().size, 2)
    })

    it('Test AslVisualizationCDKManager managedVisualizations set does not add duplicate renders when multiple Vis active', async function () {
    })

    it('Test AslVisualizationCDKManager managedVisualizations set removes correct visualization on visualization dispose, multiple vis', async function () {
    })

    it('Test AslVisualisationCDK sendUpdateMessage posts a correct update message for ASL files', async function () {
    })
    
})