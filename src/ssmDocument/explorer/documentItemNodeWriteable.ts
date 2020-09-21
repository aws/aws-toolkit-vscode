/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM } from 'aws-sdk'
import { SsmDocumentClient } from '../../shared/clients/ssmDocumentClient'
import { DocumentItemNode } from './documentItemNode'

export class DocumentItemNodeWriteable extends DocumentItemNode {
    public constructor(
        documentItem: SSM.Types.DocumentIdentifier,
        public readonly client: SsmDocumentClient,
        public readonly regionCode: string
    ) {
        super(documentItem, client, regionCode)
        this.contextValue = 'awsDocumentItemNodeWriteable'
    }
    public async deleteDocument(): Promise<SSM.Types.DeleteDocumentResult> {
        if (!this.documentName || !this.documentName.length) {
            return Promise.resolve({})
        }

        return await this.client.deleteDocument(this.documentName)
    }
}
