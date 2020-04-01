/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'

import { listRegistryItems } from '../../eventSchemas/utils'
import { SchemaClient } from '../../shared/clients/schemaClient'

import { ext } from '../../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { toMapAsync, updateInPlace } from '../../shared/utilities/collectionUtils'
import { RegistryItemNode } from './registryItemNode'

export class SchemasNode extends AWSTreeNodeBase {
    private readonly registryNodes: Map<string, RegistryItemNode>

    public constructor(public readonly regionCode: string) {
        super('Schemas', vscode.TreeItemCollapsibleState.Collapsed)
        this.registryNodes = new Map<string, RegistryItemNode>()
        this.contextValue = 'awsSchemasNode'
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.registryNodes.values()]
            },
            getErrorNode: async (error: Error) =>
                new ErrorNode(
                    this,
                    error,
                    localize('AWS.explorerNode.schemas.error', 'Error loading Schemas resources')
                ),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.schemas.noRegistry', '[No Schema Registries]')),
            sort: (nodeA: RegistryItemNode, nodeB: RegistryItemNode) =>
                nodeA.registryName.localeCompare(nodeB.registryName),
        })
    }

    public async updateChildren(): Promise<void> {
        const client: SchemaClient = ext.toolkitClientBuilder.createSchemaClient(this.regionCode)
        const registries = await toMapAsync(listRegistryItems(client), registry => registry.RegistryName)

        updateInPlace(
            this.registryNodes,
            registries.keys(),
            key => this.registryNodes.get(key)!.update(registries.get(key)!),
            key => new RegistryItemNode(this.regionCode, registries.get(key)!)
        )
    }
}
