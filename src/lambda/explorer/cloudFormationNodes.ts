/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { CloudFormation, Lambda } from 'aws-sdk'
import * as vscode from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'
import { intersection, toArrayAsync, toMap, toMapAsync, updateInPlace } from '../collectionUtils'
import { listCloudFormationStacks, listLambdaFunctions } from '../utils'
import { FunctionNodeBase } from './functionNode'
import { PlaceholderNode } from './placeholderNode'
import { RegionNode } from './regionNode'

export class CloudFormationStackGroupNode extends AWSTreeNodeBase {
    private readonly stackNodes: Map<string, CloudFormationStackNode>

    public get regionCode(): string {
        return this.parent.regionCode
    }

    public constructor(public readonly parent: RegionNode) {
        super('CloudFormation', vscode.TreeItemCollapsibleState.Collapsed)
        this.stackNodes = new Map<string, CloudFormationStackNode>()
    }

    public async getChildren() {
        await this.updateChildren()

        return [...this.stackNodes.values()]
    }

    public async updateChildren(): Promise<void> {
        const client = ext.toolkitClientBuilder.createCloudFormationClient(this.regionCode)
        const stacks = await toMapAsync(listCloudFormationStacks(client), stack => stack.StackId)

        updateInPlace(
            this.stackNodes,
            stacks.keys(),
            key => this.stackNodes.get(key)!.update(stacks.get(key)!),
            key => new CloudFormationStackNode(this, stacks.get(key)!)
        )
    }
}

export class CloudFormationStackNode extends AWSTreeNodeBase {
    private readonly functionNodes: Map<string, CloudFormationFunctionNode>

    public get regionCode(): string {
        return this.parent.regionCode
    }

    public constructor(
        public readonly parent: CloudFormationStackGroupNode,
        private stackSummary: CloudFormation.StackSummary
    ) {
        super('', vscode.TreeItemCollapsibleState.Collapsed)

        this.update(stackSummary)
        this.iconPath = {
            dark: vscode.Uri.file(ext.context.asAbsolutePath('resources/dark/cloudformation.svg')),
            light: vscode.Uri.file(ext.context.asAbsolutePath('resources/light/cloudformation.svg'))
        }
        this.contextValue = 'awsCloudFormationNode'
        this.functionNodes = new Map<string, CloudFormationFunctionNode>()
    }

    public async getChildren(): Promise<(CloudFormationFunctionNode | PlaceholderNode)[]> {
        await this.updateChildren()

        if (this.functionNodes.size > 0) {
            return [...this.functionNodes.values()]
        } else {
            return [
                new PlaceholderNode(
                    this,
                    localize('AWS.explorerNode.cloudFormation.noFunctions', '[no functions in this CloudFormation]')
                )
            ]
        }
    }

    public update(stackSummary: CloudFormation.StackSummary): void {
        this.stackSummary = stackSummary
        this.label = `${stackSummary.StackName} [${stackSummary.StackStatus}]`
        this.tooltip = `${stackSummary.StackName}-${stackSummary.StackId}`
    }

    private async updateChildren(): Promise<void> {
        const resources: string[] = await this.resolveLambdaResources()
        const client = ext.toolkitClientBuilder.createLambdaClient(this.regionCode)
        const functions: Map<string, Lambda.FunctionConfiguration> = toMap(
            await toArrayAsync(listLambdaFunctions(client)),
            functionInfo => functionInfo.FunctionName
        )

        updateInPlace(
            this.functionNodes,
            intersection(resources, functions.keys()),
            key => this.functionNodes.get(key)!.update(functions.get(key)!),
            key => new CloudFormationFunctionNode(this, functions.get(key)!)
        )
    }

    private async resolveLambdaResources(): Promise<string[]> {
        const client = ext.toolkitClientBuilder.createCloudFormationClient(this.regionCode)
        const response = await client.describeStackResources(this.stackSummary.StackName)

        if (response.StackResources) {
            return response.StackResources
                .filter(it => it.ResourceType.includes('Lambda::Function'))
                .map(it => it.PhysicalResourceId || 'none')
        }

        return []
    }
}

export class CloudFormationFunctionNode extends FunctionNodeBase {
    public get regionCode(): string {
        return this.parent.regionCode
    }

    public constructor(public readonly parent: CloudFormationStackNode, configuration: Lambda.FunctionConfiguration) {
        super(configuration)
        this.contextValue = 'awsCloudFormationFunctionNode'
    }
}
