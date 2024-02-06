/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'

import { listRegistryItems } from '../../eventSchemas/utils'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { toMapAsync, updateInPlace } from '../../shared/utilities/collectionUtils'
import { RegistryItemNode } from './registryItemNode'
import { SchemaClient } from '../../shared/clients/schemaClient'

export class SchemasNode extends AWSTreeNodeBase {
    private readonly registryNodes: Map<string, RegistryItemNode>
    public override readonly regionCode = this.client.regionCode

    public constructor(private readonly client: SchemaClient) {
        super('Schemas', vscode.TreeItemCollapsibleState.Collapsed)
        this.registryNodes = new Map<string, RegistryItemNode>()
        this.contextValue = 'awsSchemasNode'
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.registryNodes.values()]
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.schemas.noRegistry', '[No Schema Registries]')),
            sort: (nodeA, nodeB) => nodeA.registryName.localeCompare(nodeB.registryName),
        })
    }

    public async updateChildren(): Promise<void> {
        const registries = await toMapAsync(listRegistryItems(this.client), registry => registry.RegistryName)

        updateInPlace(
            this.registryNodes,
            registries.keys(),
            key => this.registryNodes.get(key)!.update(registries.get(key)!),
            key => new RegistryItemNode(registries.get(key)!, this.client)
        )
    }
}
