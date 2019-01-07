/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { Lambda } from 'aws-sdk'
import * as vscode from 'vscode'
import { LambdaClient } from '../../shared/clients/lambdaClient'
import { ext } from '../../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'
import { toArrayAsync, toMap, updateInPlace } from '../../shared/utilities/collectionUtils'
import { listLambdaFunctions } from '../utils'
import { FunctionNodeBase } from './functionNode'
import { RegionNode } from './regionNode'

export class StandaloneFunctionGroupNode extends AWSTreeNodeBase {
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

    public async getChildren(): Promise<StandaloneFunctionNode[]> {
        await this.updateChildren()

        return [...this.functionNodes.values()]
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
            key => new StandaloneFunctionNode(this, functions.get(key)!)
        )
    }
}

export class StandaloneFunctionNode extends FunctionNodeBase {
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
