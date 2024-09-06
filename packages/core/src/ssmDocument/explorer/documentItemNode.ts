/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM } from 'aws-sdk'

import { SsmDocumentClient } from '../../shared/clients/ssmDocumentClient'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'

import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { getIcon } from '../../shared/icons'

export class DocumentItemNode extends AWSTreeNodeBase {
    public constructor(
        private documentItem: SSM.Types.DocumentIdentifier,
        public readonly client: SsmDocumentClient,
        public override readonly regionCode: string
    ) {
        super('')
        this.update(documentItem)
        this.contextValue = 'awsDocumentItemNode'
        this.iconPath = getIcon('vscode-file')
    }

    public update(documentItem: SSM.Types.DocumentIdentifier): void {
        this.documentItem = documentItem
        this.label = this.documentName
    }

    public get documentName(): string {
        return this.documentItem.Name || ''
    }

    public get documentOwner(): string {
        return this.documentItem.Owner || ''
    }

    public async getDocumentContent(
        documentVersion?: string,
        documentFormat?: string
    ): Promise<SSM.Types.GetDocumentResult> {
        if (!this.documentName || !this.documentName.length) {
            return Promise.resolve({})
        }

        let resolvedDocumentFormat: string | undefined

        if (documentFormat === undefined) {
            // retrieves the document format from the service
            const documentDescription = await this.client.describeDocument(this.documentName, documentVersion)
            resolvedDocumentFormat = documentDescription.Document?.DocumentFormat
        } else {
            resolvedDocumentFormat = documentFormat
        }

        return await this.client.getDocument(
            this.documentName,
            documentVersion || this.documentItem.DocumentVersion,
            resolvedDocumentFormat
        )
    }

    public async listSchemaVersion(): Promise<SSM.Types.DocumentVersionInfo[]> {
        return await toArrayAsync(this.client.listDocumentVersions(this.documentName))
    }
}
