/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { Schemas } from 'aws-sdk'
import * as os from 'os'
import * as vscode from 'vscode'

import { listSchemaItems } from '../utils'

import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { toMapAsync, updateInPlace } from '../../shared/utilities/collectionUtils'
import { SchemaItemNode } from './schemaItemNode'
import { getIcon } from '../../shared/icons'
import { SchemaClient } from '../../shared/clients/schemaClient'

export class RegistryItemNode extends AWSTreeNodeBase {
    private readonly schemaNodes: Map<string, SchemaItemNode>
    public override readonly regionCode: string = this.client.regionCode

    public constructor(private registryItemOutput: Schemas.RegistrySummary, private readonly client: SchemaClient) {
        super('', vscode.TreeItemCollapsibleState.Collapsed)

        this.update(registryItemOutput)
        this.contextValue = 'awsRegistryItemNode'
        this.schemaNodes = new Map<string, SchemaItemNode>()
        this.iconPath = getIcon('aws-schemas-registry')
    }

    public get registryName(): string {
        return (
            this.registryItemOutput.RegistryName ||
            localize('AWS.explorerNode.registry.registryName.Not.Found', 'Registry name not found')
        )
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.schemaNodes.values()]
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.registry.noSchemas', '[No Registry Schemas]')),
            sort: (nodeA, nodeB) => nodeA.schemaName.localeCompare(nodeB.schemaName),
        })
    }

    public update(registryItemOutput: Schemas.RegistrySummary): void {
        this.registryItemOutput = registryItemOutput
        this.label = `${this.registryName}`
        let registryArn = ''
        if (this.registryItemOutput.RegistryArn) {
            registryArn = `${os.EOL}${this.registryItemOutput.RegistryArn}`
        }
        this.tooltip = `${this.registryName}${registryArn}`
    }

    public async updateChildren(): Promise<void> {
        const schemas = await toMapAsync(listSchemaItems(this.client, this.registryName), schema => schema.SchemaName)

        updateInPlace(
            this.schemaNodes,
            schemas.keys(),
            key => this.schemaNodes.get(key)!.update(schemas.get(key)!),
            key => new SchemaItemNode(schemas.get(key)!, this.client, this.registryName)
        )
    }
}
