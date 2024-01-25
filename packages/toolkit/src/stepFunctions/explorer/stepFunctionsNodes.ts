/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { StepFunctions } from 'aws-sdk'
import * as vscode from 'vscode'
import { DefaultStepFunctionsClient } from '../../shared/clients/stepFunctionsClient'

import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { toArrayAsync, toMap, updateInPlace } from '../../shared/utilities/collectionUtils'
import { listStateMachines } from '../../stepFunctions/utils'
import { getIcon } from '../../shared/icons'

export const contextValueStateMachine = 'awsStateMachineNode'

const sfnNodeMap = new Map<string, StepFunctionsNode>()

export function refreshStepFunctionsTree(regionCode: string) {
    const node = sfnNodeMap.get(regionCode)

    if (node) {
        void vscode.commands.executeCommand('aws.refreshAwsExplorerNode', node)
    }
}

/**
 * An AWS Explorer node representing the Step Functions Service.
 * Contains State Machines for a specific region as child nodes.
 */
export class StepFunctionsNode extends AWSTreeNodeBase {
    private readonly stateMachineNodes: Map<string, StateMachineNode>

    public constructor(
        public override readonly regionCode: string,
        private readonly client = new DefaultStepFunctionsClient(regionCode)
    ) {
        super('Step Functions', vscode.TreeItemCollapsibleState.Collapsed)
        this.stateMachineNodes = new Map<string, StateMachineNode>()
        this.contextValue = 'awsStepFunctionsNode'
        sfnNodeMap.set(regionCode, this)
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.stateMachineNodes.values()]
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(
                    this,
                    localize('AWS.explorerNode.stepfunctions.noStateMachine', '[No State Machines found]')
                ),
            sort: (nodeA, nodeB) => nodeA.functionName.localeCompare(nodeB.functionName),
        })
    }

    public async updateChildren(): Promise<void> {
        const functions: Map<string, StepFunctions.StateMachineListItem> = toMap(
            await toArrayAsync(listStateMachines(this.client)),
            details => details.name
        )

        updateInPlace(
            this.stateMachineNodes,
            functions.keys(),
            key => this.stateMachineNodes.get(key)!.update(functions.get(key)!),
            key => makeStateMachineNode(this, this.regionCode, functions.get(key)!)
        )
    }
}

export class StateMachineNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly parent: AWSTreeNodeBase,
        public override readonly regionCode: string,
        public details: StepFunctions.StateMachineListItem
    ) {
        super('')
        this.update(details)
        this.iconPath = getIcon('aws-stepfunctions-preview')
    }

    public update(details: StepFunctions.StateMachineListItem): void {
        this.details = details
        this.label = this.details.name || ''
        this.tooltip = `${this.details.name}${os.EOL}${this.details.stateMachineArn}`
    }

    public get functionName(): string {
        return this.details.name || ''
    }

    public get arn(): string {
        return this.details.stateMachineArn
    }

    public get name(): string {
        if (this.details.name === undefined) {
            throw new Error('name expected but not found')
        }

        return this.details.name
    }
}

function makeStateMachineNode(
    parent: AWSTreeNodeBase,
    regionCode: string,
    details: StepFunctions.StateMachineListItem
): StateMachineNode {
    const node = new StateMachineNode(parent, regionCode, details)
    node.contextValue = contextValueStateMachine

    return node
}
