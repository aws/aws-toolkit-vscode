/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeleteDocumentResult, DocumentIdentifier, UpdateDocumentDefaultVersionResult } from '@aws-sdk/client-ssm'
import { RegistryItemNode } from './registryItemNode'
import { SsmDocumentClient } from '../../shared/clients/ssmDocumentClient'
import { DocumentItemNode } from './documentItemNode'

export class DocumentItemNodeWriteable extends DocumentItemNode {
    public constructor(
        documentItem: DocumentIdentifier,
        public override readonly client: SsmDocumentClient,
        public override readonly regionCode: string,
        public readonly parent: RegistryItemNode
    ) {
        super(documentItem, client, regionCode)
        this.contextValue = 'awsDocumentItemNodeWriteable'
        this.parent = parent
    }

    public async deleteDocument(): Promise<DeleteDocumentResult> {
        if (!this.documentName || !this.documentName.length) {
            return Promise.resolve({})
        }

        return await this.client.deleteDocument(this.documentName)
    }

    public async updateDocumentVersion(documentVersion?: string): Promise<UpdateDocumentDefaultVersionResult> {
        if (!documentVersion || !documentVersion.length) {
            return Promise.resolve({})
        }
        return await this.client.updateDocumentVersion(this.documentName, documentVersion)
    }
}
