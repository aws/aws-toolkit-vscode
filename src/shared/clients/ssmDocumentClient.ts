/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM } from 'aws-sdk'

export interface SsmDocumentClient {
    readonly regionCode: string

    deleteDocument(documentName: string): Promise<SSM.Types.DeleteDocumentResult>
    listDocuments(request: SSM.Types.ListDocumentsRequest): AsyncIterableIterator<SSM.Types.DocumentIdentifier>
    listDocumentVersions(documentName: string): AsyncIterableIterator<SSM.Types.DocumentVersionInfo>
    describeDocument(documentName: string, documentVersion?: string): Promise<SSM.Types.DescribeDocumentResult>
    getDocument(
        documentName: string,
        documentVersion?: string,
        documentFormat?: string
    ): Promise<SSM.Types.GetDocumentResult>
    createDocument(request: SSM.Types.CreateDocumentRequest): Promise<SSM.Types.CreateDocumentResult>
    updateDocument(request: SSM.Types.UpdateDocumentRequest): Promise<SSM.Types.UpdateDocumentResult>
    updateDocumentVersion(
        documentName: string,
        documentVersion: string
    ): Promise<SSM.Types.UpdateDocumentDefaultVersionResult>
}
