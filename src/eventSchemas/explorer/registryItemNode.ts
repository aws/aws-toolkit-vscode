/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { Schemas } from 'aws-sdk'
import * as os from 'os'
import * as vscode from 'vscode'

import { listSchemaItems } from '../utils'

import { SchemaClient } from '../../shared/clients/schemaClient'
import { ext } from '../../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { toMapAsync, updateInPlace } from '../../shared/utilities/collectionUtils'
import { SchemaItemNode } from './schemaItemNode'

export class RegistryItemNode extends AWSTreeNodeBase {
    private readonly schemaNodes: Map<string, SchemaItemNode>

    public constructor(public readonly regionCode: string, private registryItemOutput: Schemas.RegistrySummary) {
        super('', vscode.TreeItemCollapsibleState.Collapsed)

        this.update(registryItemOutput)
        this.contextValue = 'awsRegistryItemNode'
        this.schemaNodes = new Map<string, SchemaItemNode>()
        this.iconPath = {
            dark: vscode.Uri.file(ext.iconPaths.dark.registry),
            light: vscode.Uri.file(ext.iconPaths.light.registry),
        }
    }

    public get registryName(): string {
        return (
            this.registryItemOutput.RegistryName ||
            localize('AWS.explorerNode.registry.registryName.Not.Found', 'Registry name not found')
        )
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.schemaNodes.values()]
            },
            getErrorNode: async (error: Error) =>
                new ErrorNode(
                    this,
                    error,
                    localize('AWS.explorerNode.registry.error', 'Error loading registry schema items')
                ),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.registry.noSchemas', '[No Registry Schemas]')),
            sort: (nodeA: SchemaItemNode, nodeB: SchemaItemNode) => nodeA.schemaName.localeCompare(nodeB.schemaName),
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
        const client: SchemaClient = ext.toolkitClientBuilder.createSchemaClient(this.regionCode)
        const schemas = await toMapAsync(listSchemaItems(client, this.registryName), schema => schema.SchemaName)

        updateInPlace(
            this.schemaNodes,
            schemas.keys(),
            key => this.schemaNodes.get(key)!.update(schemas.get(key)!),
            key => new SchemaItemNode(schemas.get(key)!, client, this.registryName)
        )
    }
}
