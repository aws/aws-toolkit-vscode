/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { CloudFormation, Lambda } from 'aws-sdk'
import * as os from 'os'
import * as vscode from 'vscode'
import { DefaultCloudFormationClient } from '../../shared/clients/cloudFormationClient'
import { DefaultLambdaClient } from '../../shared/clients/lambdaClient'

import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { intersection, toArrayAsync, toMap, toMapAsync, updateInPlace } from '../../shared/utilities/collectionUtils'
import { listCloudFormationStacks, listLambdaFunctions } from '../utils'
import { LambdaFunctionNode } from './lambdaFunctionNode'
import { getIcon } from '../../shared/icons'

export const contextValueCloudformationLambdaFunction = 'awsCloudFormationFunctionNode'

export class CloudFormationNode extends AWSTreeNodeBase {
    private readonly stackNodes: Map<string, CloudFormationStackNode>

    public constructor(
        public override readonly regionCode: string,
        private readonly client = new DefaultCloudFormationClient(regionCode)
    ) {
        super('CloudFormation', vscode.TreeItemCollapsibleState.Collapsed)
        this.stackNodes = new Map<string, CloudFormationStackNode>()
        this.contextValue = 'awsCloudFormationRootNode'
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.stackNodes.values()]
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.cloudformation.noStacks', '[No Stacks found]')),
            sort: (nodeA, nodeB) => nodeA.stackName.localeCompare(nodeB.stackName),
        })
    }

    public async updateChildren(): Promise<void> {
        const stacks = await toMapAsync(listCloudFormationStacks(this.client), stack => stack.StackId)

        updateInPlace(
            this.stackNodes,
            stacks.keys(),
            key => this.stackNodes.get(key)!.update(stacks.get(key)!),
            key => new CloudFormationStackNode(this, this.regionCode, stacks.get(key)!)
        )
    }
}

export class CloudFormationStackNode extends AWSTreeNodeBase implements AWSResourceNode {
    private readonly functionNodes: Map<string, LambdaFunctionNode>

    public constructor(
        public readonly parent: AWSTreeNodeBase,
        public override readonly regionCode: string,
        private stackSummary: CloudFormation.StackSummary,
        private readonly lambdaClient = new DefaultLambdaClient(regionCode),
        private readonly cloudformationClient = new DefaultCloudFormationClient(regionCode)
    ) {
        super('', vscode.TreeItemCollapsibleState.Collapsed)

        this.update(stackSummary)
        this.contextValue = 'awsCloudFormationNode'
        this.functionNodes = new Map<string, LambdaFunctionNode>()
        this.iconPath = getIcon('aws-cloudformation-stack')
    }

    public get stackId(): CloudFormation.StackId | undefined {
        return this.stackSummary.StackId
    }

    public get arn(): string {
        if (this.stackId === undefined) {
            throw new Error('StackId expected but not found')
        }

        return this.stackId
    }

    public get name(): string {
        return this.stackName
    }

    public get stackName(): CloudFormation.StackName {
        return this.stackSummary.StackName
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.functionNodes.values()]
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(
                    this,
                    localize('AWS.explorerNode.cloudFormation.noFunctions', '[Stack has no Lambda Functions]')
                ),
            sort: (nodeA, nodeB) => nodeA.functionName.localeCompare(nodeB.functionName),
        })
    }

    public update(stackSummary: CloudFormation.StackSummary): void {
        this.stackSummary = stackSummary
        this.label = `${this.stackName} [${stackSummary.StackStatus}]`
        this.tooltip = `${this.stackName}${os.EOL}${this.stackId}`
    }

    private async updateChildren(): Promise<void> {
        const resources: string[] = await this.resolveLambdaResources()
        const functions: Map<string, Lambda.FunctionConfiguration> = toMap(
            await toArrayAsync(listLambdaFunctions(this.lambdaClient)),
            functionInfo => functionInfo.FunctionName
        )

        updateInPlace(
            this.functionNodes,
            intersection(resources, functions.keys()),
            key => this.functionNodes.get(key)!.update(functions.get(key)!),
            key => makeCloudFormationLambdaFunctionNode(this, this.regionCode, functions.get(key)!)
        )
    }

    private async resolveLambdaResources(): Promise<string[]> {
        const response = await this.cloudformationClient.describeStackResources(this.stackSummary.StackName)

        if (response.StackResources) {
            return response.StackResources.filter(it => it.ResourceType.includes('Lambda::Function')).map(
                it => it.PhysicalResourceId || 'none'
            )
        }

        return []
    }
}

function makeCloudFormationLambdaFunctionNode(
    parent: AWSTreeNodeBase,
    regionCode: string,
    configuration: Lambda.FunctionConfiguration
): LambdaFunctionNode {
    const node = new LambdaFunctionNode(parent, regionCode, configuration)
    node.contextValue = contextValueCloudformationLambdaFunction

    return node
}
