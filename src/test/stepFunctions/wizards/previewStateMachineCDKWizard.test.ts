/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as app from '../../../cdk/explorer/cdkProject'
import * as assert from 'assert'
import * as vscode from 'vscode'

import { ConstructNode } from '../../../cdk/explorer/nodes/constructNode'
import { ConstructTreeEntity } from '../../../cdk/explorer/tree/types'
import { FakeParentNode } from '../../cdk/explorer/constructNode.test'
import {
    PreviewStateMachineCDKWizard,
    CdkAppLocationPickItem,
    ConstructNodePickItem,
    getCDKAppWorkspaceName,
    TopLevelNodePickItem,
} from '../../../stepFunctions/wizards/previewStateMachineCDKWizard'

const workspaceFolderName = 'cdk-test-folder'
const workspaceFolderPath = 'rootcdk-project'

const mockTopLevelConstructTreeEntity: ConstructTreeEntity = {
    id: 'MyTopLevelNode',
    path: 'aws-tester/MyTopLevelNode',
    children: {
        Resource: {
            id: 'Resource',
            path: 'aws-tester/MyTopLevelNode/Resource',
            attributes: {
                'aws:cdk:cloudformation:type': 'AWS::StepFunctions::ConstructNode',
            },
        },
    },
}

let mockTopLevelNode: ConstructNode

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

let mockStateMachineNode: ConstructNode

function getTestNode(): app.CdkAppLocation {
    const uri = vscode.Uri.file(workspaceFolderPath)
    const mockWorkspaceFolder: vscode.WorkspaceFolder = { uri, index: 0, name: workspaceFolderName }
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
        label: getCDKAppWorkspaceName(testNode.cdkJsonPath),
        cdkApplocation: testNode,
    })

    const TOP_LEVEL_NODES: TopLevelNodePickItem[] = []

    const STATE_MACHINES: ConstructNodePickItem[] = []

    before(function () {
        mockTopLevelNode = new ConstructNode(
            new FakeParentNode('cdkJsonPath'),
            'MyTopLevelNode',
            vscode.TreeItemCollapsibleState.Collapsed,
            mockTopLevelConstructTreeEntity
        )

        mockStateMachineNode = new ConstructNode(
            new FakeParentNode('cdkJsonPath'),
            'MyStateMachine',
            vscode.TreeItemCollapsibleState.Collapsed,
            mockStateMachineConstructTreeEntity
        )

        STATE_MACHINES.push({
            label: mockStateMachineNode.label,
            stateMachineNode: mockStateMachineNode,
        })

        TOP_LEVEL_NODES.push({
            label: mockTopLevelNode.label,
            topLevelNode: mockTopLevelNode,
        })
    })

    it('exits when cancelled', async function () {
        const mockUserPrompt: any = () => Promise.resolve(undefined)
        const wizard = new PreviewStateMachineCDKWizard(mockUserPrompt)
        const result = await wizard.run()

        assert.ok(!result)
    })

    it('returns undefined when cdk application does not exist', async function () {
        const promptResults = [
            [
                {
                    label: '',
                    cdkApplocation: undefined,
                },
            ],
            [
                {
                    label: '',
                    topLevelNode: undefined,
                },
            ],
            [
                {
                    label: '',
                    stateMachineNode: undefined,
                },
            ],
        ]
        const mockUserPrompt: any = (options: any) => Promise.resolve(promptResults.shift())
        const wizard = new PreviewStateMachineCDKWizard(mockUserPrompt)
        const result = await wizard.run()

        assert.strictEqual(result, undefined)
    })

    it('returns undefined when top level node does not exist', async function () {
        const promptResults = [
            [
                {
                    label: getCDKAppWorkspaceName(testNode.cdkJsonPath),
                    cdkApplocation: testNode,
                },
            ],
            [
                {
                    label: '',
                    topLevelNode: undefined,
                },
            ],
        ]
        const mockUserPrompt: any = (options: any) => Promise.resolve(promptResults.shift())
        const wizard = new PreviewStateMachineCDKWizard(mockUserPrompt)
        const result = await wizard.run()

        assert.strictEqual(result, undefined)
    })

    it('returns undefined when state machine node does not exist', async function () {
        const promptResults = [
            [
                {
                    label: getCDKAppWorkspaceName(testNode.cdkJsonPath),
                    cdkApplocation: testNode,
                },
            ],
            [
                {
                    label: mockTopLevelNode.label,
                    topLevelNode: mockTopLevelNode,
                },
            ],
            [
                {
                    label: '',
                    stateMachineNode: undefined,
                },
            ],
        ]
        const mockUserPrompt: any = (options: any) => Promise.resolve(promptResults.shift())
        const wizard = new PreviewStateMachineCDKWizard(mockUserPrompt)
        const result = await wizard.run()

        assert.strictEqual(result, undefined)
    })

    it('returns cdk application, top level node, and state machine node when completed', async function () {
        const promptResults = [
            [
                {
                    label: getCDKAppWorkspaceName(testNode.cdkJsonPath),
                    cdkApplocation: testNode,
                },
            ],
            [
                {
                    label: mockTopLevelNode.label,
                    topLevelNode: mockTopLevelNode,
                },
            ],
            [
                {
                    label: mockStateMachineNode.label,
                    stateMachineNode: mockStateMachineNode,
                },
            ],
        ]
        const mockUserPrompt: any = (options: any) => Promise.resolve(promptResults.shift())
        const wizard = new PreviewStateMachineCDKWizard(mockUserPrompt)
        const result = await wizard.run()

        assert.deepStrictEqual(result, {
            cdkApplication: CDK_APPLOCATIONS[0],
            topLevelNode: TOP_LEVEL_NODES[0],
            stateMachine: STATE_MACHINES[0],
        })
    })
})
