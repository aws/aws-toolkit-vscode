/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'

import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { updateInPlace } from '../../shared/utilities/collectionUtils'
import { amazonRegistryName, RegistryItemNode, sharedRegistryName, userRegistryName } from './registryItemNode'
import { DefaultSsmDocumentClient } from '../../shared/clients/ssmDocumentClient'

export class DocumentTypeNode extends AWSTreeNodeBase {
    private readonly registryNodes: Map<string, RegistryItemNode>
    private readonly childRegistryNames = [amazonRegistryName, userRegistryName, sharedRegistryName]

    public constructor(
        public override readonly regionCode: string,
        public documentType: string,
        private readonly client = new DefaultSsmDocumentClient(regionCode)
    ) {
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

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.registryNodes.values()]
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(
                    this,
                    localize('AWS.explorerNode.ssmDocument.noRegistry', '[No Systems Manager Document Registries]')
                ),
            sort: (nodeA, nodeB) => nodeA.registryName.localeCompare(nodeB.registryName),
        })
    }

    public async updateChildren(): Promise<void> {
        updateInPlace(
            this.registryNodes,
            this.childRegistryNames,
            key => this.registryNodes.get(key)!.update(key),
            key => new RegistryItemNode(this.regionCode, key, this.documentType, this.client)
        )
    }
}
