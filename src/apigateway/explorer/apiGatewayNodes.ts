/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'

import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { ApiGatewayClient } from '../../shared/clients/apiGatewayClient'
import { RestApi } from 'aws-sdk/clients/apigateway'
import { toArrayAsync, toMap, updateInPlace } from '../../shared/utilities/collectionUtils'
import { RestApiNode } from './apiNodes'
import globals from '../../shared/extensionGlobals'

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
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(
                    this,
                    localize('AWS.explorerNode.apigateway.noApis', '[No API Gateway REST APIs found]')
                ),
            sort: (nodeA, nodeB) => nodeA.label!.localeCompare(nodeB.label!),
        })
    }

    public async updateChildren(): Promise<void> {
        const client: ApiGatewayClient = globals.toolkitClientBuilder.createApiGatewayClient(this.regionCode)
        const apis: Map<string, RestApi> = toMap(
            await toArrayAsync(client.listApis()),
            configuration => `${configuration.name} (${configuration.id})`
        )

        updateInPlace(
            this.apiNodes,
            apis.keys(),
            key => this.apiNodes.get(key)!.update(apis.get(key)!),
            key => new RestApiNode(this, this.partitionId, this.regionCode, apis.get(key)!)
        )
    }
}
