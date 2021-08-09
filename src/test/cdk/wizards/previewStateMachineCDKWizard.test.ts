/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as app from '../../../cdk/explorer/cdkProject'
import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'

import { ConstructNode } from '../../../../src/cdk/explorer/nodes/constructNode'
import { ConstructTreeEntity } from '../../../../src/cdk/explorer/tree/types'
import { FakeParentNode } from '../explorer/constructNode.test'
import PreviewStateMachineCDKWizard, { CdkAppLocationPickItem, ConstructNodePickItem, getCDKAppName, TopLevelNodePickItem } from '../../../cdk/wizards/previewStateMachineCDKWizard'

let sandbox: sinon.SinonSandbox
const workspaceFolderName = 'cdk-test-folder'
const workspaceFolderPath = 'rootcdk-project'

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

describe('PreviewStateMachineCDKWizard', async function () {
    const testNode = getTestNode()

    const CDK_APPLOCATIONS: CdkAppLocationPickItem[] = []
    CDK_APPLOCATIONS.push({
            label: getCDKAppName(testNode.cdkJsonPath),
            cdkApplocation: testNode
    })
    const TOP_LEVEL_NODES: TopLevelNodePickItem[] = []
    TOP_LEVEL_NODES.push({
        label: mockTopLevelNode.label,
        topLevelNode: mockTopLevelNode
    })

    const STATE_MACHINES: ConstructNodePickItem[] = []
    STATE_MACHINES.push({
        label: mockStateMachineNode.label,
        stateMachineNode: mockStateMachineNode
    })

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
        const promptResults = [
            [{
                label: '',
                cdkApplocation: undefined
            }],
            [{
                label: '',
                topLevelNode: undefined
            }],
            [{
                label: '',
                stateMachineNode: undefined
            }]
        ]

        const mockUserPrompt: any = (options: any) => Promise.resolve(promptResults.shift())

        const wizard = new PreviewStateMachineCDKWizard(mockUserPrompt)
        const result = await wizard.run()

        assert.deepStrictEqual(result, undefined)
    })

    it('returns undefined when no top level node exists', async function () {
        const promptResults = [
            [{
                label: getCDKAppName(testNode.cdkJsonPath),
                cdkApplocation: testNode
            }],
            [{
                label: '',
                topLevelNode: undefined
            }],
            [{
                label: '',
                stateMachineNode: undefined
            }]
        ]

        const mockUserPrompt: any = (options: any) => Promise.resolve(promptResults.shift())

        const wizard = new PreviewStateMachineCDKWizard(mockUserPrompt)
        const result = await wizard.run()

        assert.deepStrictEqual(result, undefined)
    })

    it('returns undefined when no state machine node exists', async function () {
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
                label: '',
                stateMachineNode: undefined
            }]
        ]
        const mockUserPrompt: any = (options: any) => Promise.resolve(promptResults.shift())
        const wizard = new PreviewStateMachineCDKWizard(mockUserPrompt)
        const result = await wizard.run()

        assert.deepStrictEqual(result, undefined)
    })

    it('returns cdk application, top level node, and state machine node when completed', async function () {
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

        assert.deepStrictEqual(result, { cdkApplication: CDK_APPLOCATIONS[0], topLevelNode: TOP_LEVEL_NODES[0], stateMachine: STATE_MACHINES[0] })
    })
})