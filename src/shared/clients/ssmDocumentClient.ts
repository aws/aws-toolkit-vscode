/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM } from 'aws-sdk'

export interface SsmDocumentClient {
    readonly regionCode: string

    listDocuments(request: SSM.Types.ListDocumentsRequest): AsyncIterableIterator<SSM.Types.DocumentIdentifier>
    listDocumentVersions(documentName: string): AsyncIterableIterator<SSM.Types.DocumentVersionInfo>
    getDocument(
        documentName: string,
        documentVersion?: string,
        documentFormat?: string
    ): Promise<SSM.Types.GetDocumentResult>
    createDocument(request: SSM.Types.CreateDocumentRequest): Promise<SSM.Types.CreateDocumentResult>
    updateDocument(request: SSM.Types.UpdateDocumentRequest): Promise<SSM.Types.UpdateDocumentResult>
}
