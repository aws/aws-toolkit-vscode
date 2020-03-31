/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { StepFunctions } from 'aws-sdk'
import * as vscode from 'vscode'
import { StepFunctionsClient } from '../../shared/clients/stepFunctionsClient'
import { ext } from '../../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { toArrayAsync, toMap, updateInPlace } from '../../shared/utilities/collectionUtils'
import { listStateMachines } from '../../stepFunctions/utils'

export const CONTEXT_VALUE_STATE_MACHINE = 'awsStateMachineNode'

/**
 * An AWS Explorer node representing the Step Functions Service.
 * Contains State Machines for a specific region as child nodes.
 */
export class StepFunctionsNode extends AWSTreeNodeBase {
    private readonly stateMachineNodes: Map<string, StateMachineNode>

    public constructor(private readonly regionCode: string) {
        super('Step Functions', vscode.TreeItemCollapsibleState.Collapsed)
        this.stateMachineNodes = new Map<string, StateMachineNode>()
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.stateMachineNodes.values()]
            },
            getErrorNode: async (error: Error) =>
                new ErrorNode(
                    this,
                    error,
                    localize('AWS.explorerNode.stepfunctions.error', 'Error loading Step Functions resources')
                ),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(
                    this,
                    localize('AWS.explorerNode.stepfunctions.noStateMachine', '[No State Machines found]')
                ),
            sort: (nodeA: StateMachineNode, nodeB: StateMachineNode) =>
                nodeA.functionName.localeCompare(nodeB.functionName),
        })
    }

    public async updateChildren(): Promise<void> {
        const client: StepFunctionsClient = ext.toolkitClientBuilder.createStepFunctionsClient(this.regionCode)
        const functions: Map<string, StepFunctions.StateMachineListItem> = toMap(
            await toArrayAsync(listStateMachines(client)),
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

export class StateMachineNode extends AWSTreeNodeBase {
    public constructor(
        public readonly parent: AWSTreeNodeBase,
        public readonly regionCode: string,
        public details: StepFunctions.StateMachineListItem
    ) {
        super('')
        this.update(details)
        this.iconPath = {
            dark: vscode.Uri.file(ext.iconPaths.dark.statemachine),
            light: vscode.Uri.file(ext.iconPaths.light.statemachine),
        }
    }

    public update(details: StepFunctions.StateMachineListItem): void {
        this.details = details
        this.label = this.details.name || ''
        this.tooltip = `${this.details.name}${os.EOL}${this.details.stateMachineArn}`
    }

    public get functionName(): string {
        return this.details.name || ''
    }
}

function makeStateMachineNode(
    parent: AWSTreeNodeBase,
    regionCode: string,
    details: StepFunctions.StateMachineListItem
): StateMachineNode {
    const node = new StateMachineNode(parent, regionCode, details)
    node.contextValue = CONTEXT_VALUE_STATE_MACHINE

    return node
}
