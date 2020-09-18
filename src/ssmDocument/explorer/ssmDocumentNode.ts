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
import { DocumentTypeNode } from './documentTypeNode'

import { supportedDocumentTypes } from 'aws-ssm-document-language-service'

export class SsmDocumentNode extends AWSTreeNodeBase {
    private readonly documentTypeNodes: Map<string, DocumentTypeNode>

    public constructor(public readonly regionCode: string) {
        super('Systems Manager Documents', vscode.TreeItemCollapsibleState.Collapsed)
        this.registryNodes = new Map<string, RegistryItemNode>()
        this.contextValue = 'awsSsmDocumentNode'
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.documentTypeNodes.values()]
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
            sort: (nodeA: DocumentTypeNode, nodeB: DocumentTypeNode) =>
                nodeA.documentType.localeCompare(nodeB.documentType),
        })
    }

    public async updateChildren(): Promise<void> {
        // supportedDocumentTypes = ['automation']
        const documentTypes = supportedDocumentTypes.map((type: string) => {
            return type[0].toUpperCase() + type.slice(1)
        })

        updateInPlace(
            this.documentTypeNodes,
            documentTypes,
            key => this.documentTypeNodes.get(key)!.update(key),
            key => new DocumentTypeNode(this.regionCode, key)
        )
    }
}
