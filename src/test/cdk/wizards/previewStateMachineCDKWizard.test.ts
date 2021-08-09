/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as app from '../../../cdk/explorer/cdkProject'
import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as path from 'path'

import * as appNode from '../../../cdk/explorer/nodes/appNode'
import { ConstructNode } from '../../../../src/cdk/explorer/nodes/constructNode'
import { ConstructTreeEntity } from '../../../../src/cdk/explorer/tree/types'
import PreviewStateMachineCDKWizard, { CdkAppLocationPickItem, ConstructNodePickItem, getCDKAppName, TopLevelNodePickItem } from '../../../cdk/wizards/previewStateMachineCDKWizard'
import { FakeParentNode } from '../explorer/constructNode.test'

let sandbox: sinon.SinonSandbox
const workspaceFolderPath = 'rootcdk-project'
const workspaceFolderName = 'cdk-test-folder'
const cdkJsonPath = path.join(workspaceFolderPath, workspaceFolderName, 'cdk.json')
const treePath = path.join(cdkJsonPath, '..', 'cdk.out', 'tree.json')



const mockTopLevelConstructTreeEntity: ConstructTreeEntity = {
    id: 'MyTopLevelNode',
    path: 'aws-tester/MyTopLevelNode',
    children: {
        'Resource': {
            id: 'Resource',
            path: 'aws-tester/MyTopLevelNode/Resource',
            attributes: {
                "aws:cdk:cloudformation:type": 'AWS::StepFunctions::ConstructNode'
            }
        }
    }
}

const mockTopLevelNode = new ConstructNode(
    new FakeParentNode('cdkJsonPath'),
    'MyTopLevelNode',
    vscode.TreeItemCollapsibleState.Collapsed,
    mockTopLevelConstructTreeEntity
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
    new FakeParentNode('cdkJsonPath2'),
    'MyStateMachine',
    vscode.TreeItemCollapsibleState.Collapsed,
    mockStateMachineConstructTreeEntity
)

describe('PreviewStateMachineCDKWizard', async function () {
    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    it('exits when cancelled', async function () {
        const mockUserPrompt: any = () => Promise.resolve(undefined)
        const wizard = new PreviewStateMachineCDKWizard(mockUserPrompt)
        const result = await wizard.run()

        assert.ok(!result)
    })

    it('returns undefined when no cdk application exists', async function () {
        // const promptRsults = [[STARTER_TEMPLATES[0]], [{ label: TemplateFormats.YAML }]]

        // const mockUserPrompt: any = (options: any) => Promise.resolve(promptRsults.shift())
        // const wizard = new CreateStateMachineWizard(mockUserPrompt)
        // const result = await wizard.run()

        // assert.deepStrictEqual(result, { template: STARTER_TEMPLATES[0], templateFormat: TemplateFormats.YAML })
        const CDK_APPLOCATIONS: CdkAppLocationPickItem[] = []
        const TOP_LEVEL_NODES: TopLevelNodePickItem[] = []
        const STATE_MACHINES: ConstructNodePickItem[] = []
        const promptResults = [CDK_APPLOCATIONS[0], TOP_LEVEL_NODES[0], STATE_MACHINES[0]]

        const mockUserPrompt: any = (options: any) => Promise.resolve(promptResults.shift())

        const wizard = new PreviewStateMachineCDKWizard(mockUserPrompt)
        const result = await wizard.run()

        // assert.deepStrictEqual(result, { cdkApplication: CDK_APPLOCATIONS[0], topLevelNode: TOP_LEVEL_NODES[0], stateMachine: STATE_MACHINES[0] })
        assert.deepStrictEqual(result, undefined)
    })

    it('returns undefined when no top level node exists', async function () {
        const CDK_APPLOCATIONS: CdkAppLocationPickItem[] = []
        const TOP_LEVEL_NODES: TopLevelNodePickItem[] = []
        const STATE_MACHINES: ConstructNodePickItem[] = []
        const promptResults = [CDK_APPLOCATIONS[0], TOP_LEVEL_NODES[0], STATE_MACHINES[0]]

        const mockUserPrompt: any = (options: any) => Promise.resolve(promptResults.shift())

        const wizard = new PreviewStateMachineCDKWizard(mockUserPrompt)
        const result = await wizard.run()

        // assert.deepStrictEqual(result, { cdkApplication: CDK_APPLOCATIONS[0], topLevelNode: TOP_LEVEL_NODES[0], stateMachine: STATE_MACHINES[0] })
        assert.deepStrictEqual(result, undefined)
    })

    it('returns undefined when no state machine node exists', async function () {
        const testNode = getTestNode()
        const CDK_APPLOCATIONS: CdkAppLocationPickItem[] = []
        //push mock cdk app location to CDK_APPLOCATION
        CDK_APPLOCATIONS.push(
            {
                label: getCDKAppName(testNode.cdkJsonPath),
                cdkApplocation: testNode
                //cdkApplocation: obj
            })
        const TOP_LEVEL_NODES: TopLevelNodePickItem[] = []
        //push mock top level node to TOP_LEVEL_NODES
        TOP_LEVEL_NODES.push({
            label: mockTopLevelNode.label,
            topLevelNode: mockTopLevelNode
        })
        const STATE_MACHINES: ConstructNodePickItem[] = []
        const promptResults = [CDK_APPLOCATIONS[0], TOP_LEVEL_NODES[0], STATE_MACHINES[0]]

        const mockUserPrompt: any = (options: any) => Promise.resolve(promptResults.shift())

        const wizard = new PreviewStateMachineCDKWizard(mockUserPrompt)
        const result = await wizard.run()

        // assert.deepStrictEqual(result, { cdkApplication: CDK_APPLOCATIONS[0], topLevelNode: TOP_LEVEL_NODES[0], stateMachine: STATE_MACHINES[0] })
        assert.deepStrictEqual(result, undefined)
    })

    it('returns cdk application, top level node, and state machine node when completed', async function () {
        const testNode = getTestNode()
        const CDK_APPLOCATIONS: CdkAppLocationPickItem[] = []
        //push mock cdk app location to CDK_APPLOCATION
        CDK_APPLOCATIONS.push(
            {
                label: getCDKAppName(testNode.cdkJsonPath),
                cdkApplocation: testNode
            })
        const TOP_LEVEL_NODES: TopLevelNodePickItem[] = []
        //push mock top level node to TOP_LEVEL_NODES
        TOP_LEVEL_NODES.push({
            label: mockTopLevelNode.label,
            topLevelNode: mockTopLevelNode
        })
        const STATE_MACHINES: ConstructNodePickItem[] = []
        //push mock state machine node to STATE_MACHINES
        STATE_MACHINES.push({
            label: mockStateMachineNode.label,
            stateMachineNode: mockStateMachineNode
            //stateMachineNode: node as ConstructNode
        })
        const promptResults = [
            [{
                label: getCDKAppName(testNode.cdkJsonPath),
                cdkApplocation: testNode
            }],
            [{
                label: mockTopLevelNode.label,
                topLevelNode: mockTopLevelNode
            }],
            [{
                label: mockStateMachineNode.label,
                stateMachineNode: mockStateMachineNode
            }]
        ]

        const mockUserPrompt: any = (options: any) => Promise.resolve(promptResults.shift())

        const wizard = new PreviewStateMachineCDKWizard(mockUserPrompt)
        const result = await wizard.run()
        //assert.deepStrictEqual(result?.cdkApplication.label,getCDKAppName(testNode.cdkJsonPath))
        assert.ok(TOP_LEVEL_NODES[0])
        assert.ok(STATE_MACHINES[0])
        //assert.strictEqual(result,undefined)
        assert.deepStrictEqual(result, { cdkApplication: CDK_APPLOCATIONS[0], topLevelNode: TOP_LEVEL_NODES[0], stateMachine: STATE_MACHINES[0] })
    })

    function getTestNode(): app.CdkAppLocation {
        const mockUri = sandbox.createStubInstance(vscode.Uri)
        sandbox.stub(mockUri, 'fsPath').value(workspaceFolderPath)
        const mockWorkspaceFolder: vscode.WorkspaceFolder = { uri: mockUri, index: 0, name: workspaceFolderName }
        const appLocation: app.CdkAppLocation = {
            cdkJsonPath: 'cdkJsonPath',
            treePath: 'treePath',
            workspaceFolder: mockWorkspaceFolder,
        }

        return appLocation
    }
})