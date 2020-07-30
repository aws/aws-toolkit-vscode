/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { SSM } from 'aws-sdk'
import * as vscode from 'vscode'

import { SsmDocumentClient } from '../../shared/clients/ssmDocumentClient'
import { ext } from '../../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { toArrayAsync, updateInPlace } from '../../shared/utilities/collectionUtils'
import { DocumentItemNode } from './documentItemNode'
import { amazonRegistryName, userRegistryName, sharedRegistryName } from './registryItemNode'

export class DocumentTypeNode extends AWSTreeNodeBase {
    private readonly documentNodes: Map<string, DocumentItemNode>

    public constructor(
        public readonly regionCode: string,
        public documentType: string,
        public readonly registryName: string
    ) {
        super('', vscode.TreeItemCollapsibleState.Collapsed)

        this.setLabel()

        this.documentNodes = new Map<string, DocumentItemNode>()
    }

    private setLabel() {
        this.label = `${this.documentType}`
    }

    public update(documentType: string): void {
        this.documentType = documentType
        this.setLabel()
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.documentNodes.values()]
            },
            getErrorNode: async (error: Error) =>
                new ErrorNode(
                    this,
                    error,
                    localize('AWS.explorerNode.documentType.error', 'Error loading documentType ssm document items')
                ),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(
                    this,
                    localize('AWS.explorerNode.documentType.noSsmDocument', `[No document found]`)
                ),
            sort: (nodeA: DocumentItemNode, nodeB: DocumentItemNode) =>
                nodeA.documentName.localeCompare(nodeB.documentName),
        })
    }

    private async getDocumentByOwner(client: SsmDocumentClient): Promise<SSM.DocumentIdentifier[]> {
        let request: SSM.ListDocumentsRequest = {
            Filters: [
                {
                    Key: 'DocumentType',
                    Values: [this.documentType],
                },
            ],
        }

        if (this.registryName === userRegistryName) {
            request.Filters?.push({
                Key: 'Owner',
                Values: ['Self'],
            })
        } else if (this.registryName === sharedRegistryName) {
            request.Filters?.push({
                Key: 'Owner',
                Values: ['Private'],
            })
        } else if (this.registryName === amazonRegistryName) {
            request.Filters?.push({
                Key: 'Owner',
                Values: ['Amazon'],
            })
        }

        return toArrayAsync(client.listDocuments(request))
    }

    public async updateChildren(): Promise<void> {
        const client: SsmDocumentClient = ext.toolkitClientBuilder.createSsmClient(this.regionCode)
        const documents = new Map<string, SSM.Types.DocumentIdentifier>()

        const docs = await this.getDocumentByOwner(client)
        docs.forEach(doc => {
            documents.set(doc.Name!, doc)
        })

        updateInPlace(
            this.documentNodes,
            documents.keys(),
            key => this.documentNodes.get(key)!.update(documents.get(key)!),
            key => new DocumentItemNode(documents.get(key)!, client)
        )
    }
}
