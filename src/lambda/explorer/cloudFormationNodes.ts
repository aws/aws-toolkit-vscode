/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { CloudFormation, Lambda } from 'aws-sdk'
import * as vscode from 'vscode'
import { CloudFormationClient } from '../../shared/clients/cloudFormationClient'
import { LambdaClient } from '../../shared/clients/lambdaClient'
import { ext } from '../../shared/extensionGlobals'
import { AWSTreeErrorHandlerNode } from '../../shared/treeview/awsTreeErrorHandlerNode'
import {
    intersection,
    toArrayAsync,
    toMap,
    toMapAsync,
    updateInPlace
} from '../../shared/utilities/collectionUtils'
import { listCloudFormationStacks, listLambdaFunctions } from '../utils'
import { ErrorNode } from './errorNode'
import { FunctionNodeBase } from './functionNode'
import { PlaceholderNode } from './placeholderNode'
import { RegionNode } from './regionNode'

export interface CloudFormationNode extends AWSTreeErrorHandlerNode {
    readonly regionCode: string

    readonly parent: RegionNode

    getChildren(): Thenable<(CloudFormationStackNode | ErrorNode)[] >

    updateChildren(): Thenable<void>
}

export class DefaultCloudFormationNode extends AWSTreeErrorHandlerNode implements CloudFormationNode {
    private readonly stackNodes: Map<string, CloudFormationStackNode>

    public get regionCode(): string {
        return this.parent.regionCode
    }

    public constructor(public readonly parent: RegionNode) {
        super('CloudFormation', vscode.TreeItemCollapsibleState.Collapsed)
        this.stackNodes = new Map<string, CloudFormationStackNode>()
    }

    public async getChildren(): Promise<(CloudFormationStackNode | ErrorNode)[]> {
        await this.handleErrorProneOperation(
            async () => this.updateChildren(),
            localize('AWS.explorerNode.cloudFormation.error',
                     'Error loading CloudFormation resources'))

        return !!this.errorNode ? [this.errorNode]
            : [...this.stackNodes.values()]
    }

    public async updateChildren(): Promise<void> {

        const client: CloudFormationClient = ext.toolkitClientBuilder.createCloudFormationClient(this.regionCode)
        const stacks = await toMapAsync(listCloudFormationStacks(client), stack => stack.StackId)

        updateInPlace(
            this.stackNodes,
            stacks.keys(),
            key => this.stackNodes.get(key)!.update(stacks.get(key)!),
            key => new DefaultCloudFormationStackNode(this, stacks.get(key)!)
        )
    }
}

export interface CloudFormationStackNode extends AWSTreeErrorHandlerNode {
    readonly regionCode: string

    readonly parent: CloudFormationNode

    getChildren(): Thenable<(CloudFormationFunctionNode | PlaceholderNode)[]>

    update(stackSummary: CloudFormation.StackSummary): void
}

export class DefaultCloudFormationStackNode extends AWSTreeErrorHandlerNode implements CloudFormationStackNode {
    private readonly functionNodes: Map<string, CloudFormationFunctionNode>

    public get regionCode(): string {
        return this.parent.regionCode
    }

    public constructor(
        public readonly parent: CloudFormationNode,
        private stackSummary: CloudFormation.StackSummary
    ) {
        super('', vscode.TreeItemCollapsibleState.Collapsed)

        this.update(stackSummary)
        this.contextValue = 'awsCloudFormationNode'
        this.functionNodes = new Map<string, CloudFormationFunctionNode>()
    }

    public async getChildren(): Promise<(CloudFormationFunctionNode | PlaceholderNode)[]> {
        await this.handleErrorProneOperation(async () => this.updateChildren(),
                                             localize('AWS.explorerNode.cloudFormation.error',
                                                      'Error loading CloudFormation resources'))

        if (!!this.errorNode) {
            return [this.errorNode]
        }

        if (this.functionNodes.size > 0) {
            return [...this.functionNodes.values()]
        }

        return [
            new PlaceholderNode(
                this,
                localize('AWS.explorerNode.cloudFormation.noFunctions', '[no functions in this CloudFormation]')
            )
        ]
    }

    public update(stackSummary: CloudFormation.StackSummary): void {
        this.stackSummary = stackSummary
        this.label = `${stackSummary.StackName} [${stackSummary.StackStatus}]`
        this.tooltip = `${stackSummary.StackName}-${stackSummary.StackId}`
    }

    private async updateChildren(): Promise<void> {

        const resources: string[] = await this.resolveLambdaResources()
        const client: LambdaClient = ext.toolkitClientBuilder.createLambdaClient(this.regionCode)
        const functions: Map<string, Lambda.FunctionConfiguration> = toMap(
            await toArrayAsync(listLambdaFunctions(client)),
            functionInfo => functionInfo.FunctionName
        )

        updateInPlace(
            this.functionNodes,
            intersection(resources, functions.keys()),
            key => this.functionNodes.get(key)!.update(functions.get(key)!),
            key => new DefaultCloudFormationFunctionNode(this, functions.get(key)!)
        )
    }

    private async resolveLambdaResources(): Promise<string[]> {
        const client: CloudFormationClient = ext.toolkitClientBuilder.createCloudFormationClient(this.regionCode)
        const response = await client.describeStackResources(this.stackSummary.StackName)

        if (response.StackResources) {
            return response.StackResources
                .filter(it => it.ResourceType.includes('Lambda::Function'))
                .map(it => it.PhysicalResourceId || 'none')
        }

        return []
    }
}

export interface CloudFormationFunctionNode extends FunctionNodeBase {
    readonly parent: CloudFormationStackNode
}

export class DefaultCloudFormationFunctionNode extends FunctionNodeBase {
    public get regionCode(): string {
        return this.parent.regionCode
    }

    public constructor(
        public readonly parent: CloudFormationStackNode,
        configuration: Lambda.FunctionConfiguration
    ) {
        super(configuration)
        this.contextValue = 'awsCloudFormationFunctionNode'
    }
}
