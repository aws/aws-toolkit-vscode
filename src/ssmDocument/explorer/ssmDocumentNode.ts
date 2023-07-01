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
import { DocumentTypeNode } from './documentTypeNode'
import { DefaultSsmDocumentClient } from '../../shared/clients/ssmDocumentClient'

export class SsmDocumentNode extends AWSTreeNodeBase {
    private readonly documentTypeNodes: Map<string, DocumentTypeNode>

    public constructor(
        public override readonly regionCode: string,
        private readonly client = new DefaultSsmDocumentClient(regionCode)
    ) {
        super('Systems Manager', vscode.TreeItemCollapsibleState.Collapsed)
        this.documentTypeNodes = new Map<string, DocumentTypeNode>()
        this.contextValue = 'awsSsmDocumentNode'
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.documentTypeNodes.values()]
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(
                    this,
                    localize('AWS.explorerNode.registry.noSsmDocument', `[No documentType found]`)
                ),
            sort: (nodeA, nodeB) => nodeA.documentType.localeCompare(nodeB.documentType),
        })
    }

    public async updateChildren(): Promise<void> {
        const documentTypes = ['Automation']

        updateInPlace(
            this.documentTypeNodes,
            documentTypes,
            key => this.documentTypeNodes.get(key)!.update(key),
            key => new DocumentTypeNode(this.regionCode, key, this.client)
        )
    }
}
