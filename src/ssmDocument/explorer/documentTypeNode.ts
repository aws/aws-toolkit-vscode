/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'

import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { updateInPlace } from '../../shared/utilities/collectionUtils'
import { amazonRegistryName, RegistryItemNode, sharedRegistryName, userRegistryName } from './registryItemNode'

export class DocumentTypeNode extends AWSTreeNodeBase {
    private readonly registryNodes: Map<string, RegistryItemNode>
    private readonly childRegistryNames = [amazonRegistryName, userRegistryName, sharedRegistryName]

    public constructor(public readonly regionCode: string, public documentType: string) {
        super('', vscode.TreeItemCollapsibleState.Collapsed)

        this.setLabel()

        this.registryNodes = new Map<string, RegistryItemNode>()
    }

    private setLabel() {
        this.label = `${this.documentType}` + ' Documents'
    }

    public update(documentType: string): void {
        this.documentType = documentType
        this.setLabel()
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
                    localize('AWS.explorerNode.ssmDocument.error', 'Error loading Systems Manager Document resources')
                ),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(
                    this,
                    localize('AWS.explorerNode.ssmDocument.noRegistry', '[No Systems Manager Document Registries]')
                ),
            sort: (nodeA: RegistryItemNode, nodeB: RegistryItemNode) =>
                nodeA.registryName.localeCompare(nodeB.registryName),
        })
    }

    public async updateChildren(): Promise<void> {
        updateInPlace(
            this.registryNodes,
            this.childRegistryNames,
            key => this.registryNodes.get(key)!.update(key),
            key => new RegistryItemNode(this.regionCode, key, this.documentType)
        )
    }
}
