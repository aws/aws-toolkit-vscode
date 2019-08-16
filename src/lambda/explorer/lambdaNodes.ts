/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { Lambda } from 'aws-sdk'
import * as vscode from 'vscode'
import { LambdaClient } from '../../shared/clients/lambdaClient'
import { ext } from '../../shared/extensionGlobals'
import { AWSTreeErrorHandlerNode } from '../../shared/treeview/nodes/awsTreeErrorHandlerNode'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { RegionNode } from '../../shared/treeview/nodes/regionNode'
import { toArrayAsync, toMap, updateInPlace } from '../../shared/utilities/collectionUtils'
import { listLambdaFunctions } from '../utils'
import { FunctionNodeBase } from './functionNode'

export interface LambdaFunctionGroupNode extends AWSTreeErrorHandlerNode {
    readonly regionCode: string

    readonly parent: RegionNode

    getChildren(): Thenable<(LambdaFunctionNode | ErrorNode)[]>

    updateChildren(): Thenable<void>
}

export class DefaultLambdaFunctionGroupNode extends AWSTreeErrorHandlerNode implements LambdaFunctionGroupNode {
    private readonly functionNodes: Map<string, LambdaFunctionNode>

    public get regionCode(): string {
        return this.parent.regionCode
    }

    public constructor(
        public readonly parent: RegionNode,
        private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super('Lambda', vscode.TreeItemCollapsibleState.Collapsed)
        this.functionNodes = new Map<string, LambdaFunctionNode>()
    }

    public async getChildren(): Promise<(LambdaFunctionNode | ErrorNode)[]> {
        await this.handleErrorProneOperation(
            async () => this.updateChildren(),
            localize('AWS.explorerNode.lambda.error', 'Error loading Lambda resources')
        )

        return !!this.errorNode
            ? [this.errorNode]
            : [...this.functionNodes.values()].sort((nodeA, nodeB) =>
                  nodeA.functionName.localeCompare(nodeB.functionName)
              )
    }

    public async updateChildren(): Promise<void> {
        const client: LambdaClient = ext.toolkitClientBuilder.createLambdaClient(this.regionCode)
        const functions: Map<string, Lambda.FunctionConfiguration> = toMap(
            await toArrayAsync(listLambdaFunctions(client)),
            configuration => configuration.FunctionName
        )

        updateInPlace(
            this.functionNodes,
            functions.keys(),
            key => this.functionNodes.get(key)!.update(functions.get(key)!),
            key =>
                new DefaultLambdaFunctionNode(this, functions.get(key)!, relativeExtensionPath =>
                    this.getExtensionAbsolutePath(relativeExtensionPath)
                )
        )
    }
}

export interface LambdaFunctionNode extends FunctionNodeBase {
    readonly parent: LambdaFunctionGroupNode
}

export class DefaultLambdaFunctionNode extends FunctionNodeBase implements LambdaFunctionNode {
    public get regionCode(): string {
        return this.parent.regionCode
    }

    public constructor(
        public readonly parent: LambdaFunctionGroupNode,
        configuration: Lambda.FunctionConfiguration,
        getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super(configuration, getExtensionAbsolutePath)
        this.contextValue = 'awsRegionFunctionNode'
    }
}
