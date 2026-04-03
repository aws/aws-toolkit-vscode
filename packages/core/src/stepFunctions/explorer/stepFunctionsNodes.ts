/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as StepFunctions from '@aws-sdk/client-sfn'
import * as vscode from 'vscode'
import { StepFunctionsClient } from '../../shared/clients/stepFunctions'

import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { toArrayAsync, toMap, updateInPlace } from '../../shared/utilities/collectionUtils'
import { listStateMachines, listExecutions } from '../../stepFunctions/utils'
import { getIcon, IconPath } from '../../shared/icons'

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
        private readonly client = new StepFunctionsClient(regionCode)
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
            (details) => details.name
        )

        updateInPlace(
            this.stateMachineNodes,
            functions.keys(),
            (key) => this.stateMachineNodes.get(key)!.update(functions.get(key)!),
            (key) => new StateMachineNode(this, this.regionCode, functions.get(key)!, this.client)
        )
    }
}

/**
 * Represents a Step Functions state machine in the Explorer view. This node
 * appears immediately underneath the "Step Functions" node. A StateMachineNode
 * will contain children of type StateMachineExecutionNode, representing
 * the most recent executions of that state machine.
 */
export class StateMachineNode extends AWSTreeNodeBase implements AWSResourceNode {
    public static readonly contextValue = 'awsStateMachineNode'
    public static readonly maxExecutionsToShow = 10

    private readonly stateMachineExecutionNodes: Map<string, StateMachineExecutionNode>

    public constructor(
        public readonly parent: AWSTreeNodeBase,
        public override readonly regionCode: string,
        public details: StepFunctions.StateMachineListItem,
        private readonly client: StepFunctionsClient
    ) {
        super('', vscode.TreeItemCollapsibleState.Collapsed)
        this.stateMachineExecutionNodes = new Map<string, StateMachineExecutionNode>()
        this.update(details)
        this.iconPath = getIcon('aws-stepfunctions-preview')
        this.contextValue = StateMachineNode.contextValue
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()
                return [...this.stateMachineExecutionNodes.values()]
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(
                    this,
                    localize('AWS.explorerNode.stepfunctions.noStateMachineExecution', '[No Executions found]')
                ),
            /*
             * Note: although Step Functions returns the executions in the correct order, this sorting
             * is still needed to ensure newly added nodes (via updateChildren()) appear in the correct place.
             */
            sort: (nodeA, nodeB) => {
                const dateA = nodeA.details.startDate as Date // startDate will never be undefined.
                const dateB = nodeB.details.startDate as Date
                return dateB.getTime() - dateA.getTime()
            },
        })
    }

    public async updateChildren(): Promise<void> {
        const executions: Map<string, StepFunctions.ExecutionListItem> = toMap(
            await toArrayAsync(listExecutions(this.client, this.arn, StateMachineNode.maxExecutionsToShow)),
            (details) => details.name
        )
        updateInPlace(
            this.stateMachineExecutionNodes,
            executions.keys(),
            (key) => this.stateMachineExecutionNodes.get(key)!.update(executions.get(key)!),
            (key) => new StateMachineExecutionNode(this, this.regionCode, executions.get(key)!)
        )
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
        return this.details.stateMachineArn || ''
    }

    public get name(): string {
        if (this.details.name === undefined) {
            throw new Error('name expected but not found')
        }

        return this.details.name
    }
}

/**
 * Represents a single execution of a Step Functions state machine in the Explorer
 * view. This node appears immediately underneath the corresponding StateMachineNode.
 */
export class StateMachineExecutionNode extends AWSTreeNodeBase implements AWSResourceNode {
    public static contextValue = 'awsStateMachineExecutionNode'

    public constructor(
        public readonly parent: AWSTreeNodeBase,
        public override readonly regionCode: string,
        public details: StepFunctions.ExecutionListItem
    ) {
        super('')
        this.update(details)
        this.contextValue = StateMachineExecutionNode.contextValue
    }

    public update(details: StepFunctions.ExecutionListItem): void {
        this.details = details
        this.label = this.details.name || ''
        this.tooltip = this.getToolTip(this.details)
        this.iconPath = this.getIconPathForStatus(this.details.status)
    }

    public get arn(): string {
        return this.details.executionArn || ''
    }

    public get name(): string {
        return this.details.name || ''
    }

    private getIconPathForStatus(status?: string): IconPath {
        switch (status) {
            case 'RUNNING':
                return getIcon('vscode-sync')
            case 'SUCCEEDED':
                return getIcon('vscode-check')
            default:
                return getIcon('vscode-error')
        }
    }

    private getToolTip(details: StepFunctions.ExecutionListItem) {
        const startTimeText = localize('AWS.explorerNode.stepfunctions.startTime', 'Start Time')
        const endTimeText = localize('AWS.explorerNode.stepfunctions.endTime', 'End Time')
        const durationText = localize('AWS.explorerNode.stepfunctions.duration', 'Duration')
        const secondsText = localize('AWS.explorerNode.stepfunctions.seconds', 'seconds')

        let text: string = `${details.status}${os.EOL}${startTimeText}: ${details.startDate?.toLocaleString()}${os.EOL}`
        if (details.status !== 'RUNNING') {
            text += `${endTimeText}: ${details.stopDate?.toLocaleString()}${os.EOL}`
            const endDate = details.stopDate ? details.stopDate : new Date()
            text += `${durationText}: ${Math.trunc((endDate.getTime() - details.startDate!.getTime()) / 1000)} ${secondsText}${os.EOL}`
        }
        return text
    }
}
