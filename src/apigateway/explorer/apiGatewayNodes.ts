/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { ApiGatewayClient } from '../../shared/clients/apiGatewayClient'
import { RestApi } from 'aws-sdk/clients/apigateway'
import { toArrayAsync, toMap, updateInPlace } from '../../shared/utilities/collectionUtils'
import { RestApiNode } from './apiNodes'

/**
 * An AWS Explorer node representing the API Gateway (v1) service.
 */
export class ApiGatewayNode extends AWSTreeNodeBase {
    private readonly apiNodes: Map<string, RestApiNode>

    public constructor(private readonly partitionId: string, private readonly regionCode: string) {
        super('API Gateway', vscode.TreeItemCollapsibleState.Collapsed)
        this.apiNodes = new Map<string, RestApiNode>()
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.apiNodes.values()]
            },
            getErrorNode: async (error: Error) =>
                new ErrorNode(
                    this,
                    error,
                    localize('AWS.explorerNode.apigateway.error', 'Error loading API Gateway REST APIs')
                ),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(
                    this,
                    localize('AWS.explorerNode.apigateway.noApis', '[No API Gateway REST APIs found]')
                ),
            sort: (nodeA: RestApiNode, nodeB: RestApiNode) => nodeA.name.localeCompare(nodeB.name),
        })
    }

    public async updateChildren(): Promise<void> {
        const client: ApiGatewayClient = ext.toolkitClientBuilder.createApiGatewayClient(this.regionCode)
        const apis: Map<string, RestApi> = toMap(
            await toArrayAsync(client.listApis()),
            configuration => configuration.name
        )

        updateInPlace(
            this.apiNodes,
            apis.keys(),
            key => this.apiNodes.get(key)!.update(apis.get(key)!),
            key => new RestApiNode(this, this.partitionId, this.regionCode, apis.get(key)!)
        )
    }
}
