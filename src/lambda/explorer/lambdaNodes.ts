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
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { toArrayAsync, toMap, updateInPlace } from '../../shared/utilities/collectionUtils'
import { listLambdaFunctions } from '../utils'
import { FunctionNodeBase } from './functionNode'

export interface LambdaFunctionGroupNode extends AWSTreeErrorHandlerNode {
    getChildren(): Thenable<(LambdaFunctionNode | ErrorNode)[]>

    updateChildren(): Thenable<void>
}

export class DefaultLambdaFunctionGroupNode extends AWSTreeErrorHandlerNode implements LambdaFunctionGroupNode {
    private readonly functionNodes: Map<string, LambdaFunctionNode>

    public constructor(private readonly regionCode: string) {
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
            key => new DefaultLambdaFunctionNode(this, this.regionCode, functions.get(key)!)
        )
    }
}

export interface LambdaFunctionNode extends FunctionNodeBase {
    readonly parent: AWSTreeNodeBase
}

export class DefaultLambdaFunctionNode extends FunctionNodeBase implements LambdaFunctionNode {
    public constructor(
        public readonly parent: AWSTreeNodeBase,
        public readonly regionCode: string,
        configuration: Lambda.FunctionConfiguration
    ) {
        super(parent, configuration)
        this.contextValue = 'awsRegionFunctionNode'
    }
}
