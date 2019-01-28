/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { Lambda } from 'aws-sdk'
import * as vscode from 'vscode'
import { LambdaClient } from '../../shared/clients/lambdaClient'
import { ext } from '../../shared/extensionGlobals'
import { AWSTreeErrorHandlerNode } from '../../shared/treeview/awsTreeErrorHandlerNode'
import { toArrayAsync, toMap, updateInPlace } from '../../shared/utilities/collectionUtils'
import { listLambdaFunctions } from '../utils'
import { ErrorNode } from './errorNode'
import { FunctionNodeBase } from './functionNode'
import { RegionNode } from './regionNode'

export interface StandaloneFunctionGroupNode extends AWSTreeErrorHandlerNode {
    readonly regionCode: string

    readonly parent: RegionNode

    getChildren(): Thenable<(StandaloneFunctionNode | ErrorNode)[]>

    updateChildren(): Thenable<void>
}

export class DefaultStandaloneFunctionGroupNode extends AWSTreeErrorHandlerNode implements StandaloneFunctionGroupNode {
    private readonly functionNodes: Map<string, StandaloneFunctionNode>

    public get regionCode(): string {
        return this.parent.regionCode
    }

    public constructor(
        public readonly parent: RegionNode
    ) {
        super('Lambda', vscode.TreeItemCollapsibleState.Collapsed)
        this.functionNodes = new Map<string, StandaloneFunctionNode>()
    }

    public async getChildren(): Promise<(StandaloneFunctionNode | ErrorNode)[]> {
        await this.handleErrorProneOperation(async () => this.updateChildren(),
                                             localize('AWS.explorerNode.lambda.error',
                                                      'Error loading Lambda resources'))

        return !!this.errorNode ? [this.errorNode]
            : [...this.functionNodes.values()]
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
            key => new DefaultStandaloneFunctionNode(this, functions.get(key)!)
        )
    }
}

export interface StandaloneFunctionNode extends FunctionNodeBase {
    readonly parent: StandaloneFunctionGroupNode
}

export class DefaultStandaloneFunctionNode extends FunctionNodeBase implements StandaloneFunctionNode {
    public get regionCode(): string {
        return this.parent.regionCode
    }

    public constructor(
        public readonly parent: StandaloneFunctionGroupNode,
        configuration: Lambda.FunctionConfiguration
    ) {
        super(configuration)
        this.contextValue = 'awsRegionFunctionNode'
    }
}
