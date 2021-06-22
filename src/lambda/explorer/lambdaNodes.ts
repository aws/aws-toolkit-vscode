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
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { toArrayAsync, toMap, updateInPlace } from '../../shared/utilities/collectionUtils'
import { listLambdaFunctions } from '../utils'
import { LambdaFunctionNode } from './lambdaFunctionNode'
import { samLambdaImportableRuntimes } from '../models/samLambdaRuntime'

export const CONTEXT_VALUE_LAMBDA_FUNCTION = 'awsRegionFunctionNode'
export const CONTEXT_VALUE_LAMBDA_FUNCTION_IMPORTABLE = 'awsRegionFunctionNodeDownloadable'

/**
 * An AWS Explorer node representing the Lambda Service.
 * Contains Lambda Functions for a specific region as child nodes.
 */
export class LambdaNode extends AWSTreeNodeBase {
    private readonly functionNodes: Map<string, LambdaFunctionNode>

    public constructor(private readonly regionCode: string) {
        super('Lambda', vscode.TreeItemCollapsibleState.Collapsed)
        this.functionNodes = new Map<string, LambdaFunctionNode>()
        this.contextValue = 'awsLambdaNode'
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.functionNodes.values()]
            },
            getErrorNode: async (error: Error, logID: number) =>
                new ErrorNode(this, error, logID),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.lambda.noFunctions', '[No Functions found]')),
            sort: (nodeA: LambdaFunctionNode, nodeB: LambdaFunctionNode) =>
                nodeA.functionName.localeCompare(nodeB.functionName),
        })
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
            key => makeLambdaFunctionNode(this, this.regionCode, functions.get(key)!)
        )
    }
}

function makeLambdaFunctionNode(
    parent: AWSTreeNodeBase,
    regionCode: string,
    configuration: Lambda.FunctionConfiguration
): LambdaFunctionNode {
    const node = new LambdaFunctionNode(parent, regionCode, configuration)
    node.contextValue = samLambdaImportableRuntimes.contains(node.configuration.Runtime ?? '')
        ? CONTEXT_VALUE_LAMBDA_FUNCTION_IMPORTABLE
        : CONTEXT_VALUE_LAMBDA_FUNCTION

    return node
}
