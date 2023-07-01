/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM } from 'aws-sdk'
import globals from '../extensionGlobals'

import { ClassToInterfaceType } from '../utilities/tsUtils'

export type SsmDocumentClient = ClassToInterfaceType<DefaultSsmDocumentClient>
export class DefaultSsmDocumentClient {
    public constructor(public readonly regionCode: string) {}

    public async deleteDocument(documentName: string): Promise<SSM.Types.DeleteDocumentResult> {
        const client = await this.createSdkClient()

        const request: SSM.Types.DeleteDocumentRequest = {
            Name: documentName,
        }

        return await client.deleteDocument(request).promise()
    }

    public async *listDocuments(
        request: SSM.Types.ListDocumentsRequest = {}
    ): AsyncIterableIterator<SSM.DocumentIdentifier> {
        const client = await this.createSdkClient()

        do {
            const response: SSM.Types.ListDocumentsResult = await client.listDocuments(request).promise()

            if (response.DocumentIdentifiers) {
                yield* response.DocumentIdentifiers
            }

            request.NextToken = response.NextToken
        } while (request.NextToken)
    }

    public async *listDocumentVersions(documentName: string): AsyncIterableIterator<SSM.Types.DocumentVersionInfo> {
        const client = await this.createSdkClient()

        const request: SSM.Types.ListDocumentVersionsRequest = {
            Name: documentName,
        }

        do {
            const response: SSM.Types.ListDocumentVersionsResult = await client.listDocumentVersions(request).promise()

            if (response.DocumentVersions) {
                yield* response.DocumentVersions
            }

            request.NextToken = response.NextToken
        } while (request.NextToken)
    }

    public async describeDocument(documentName: string, documentVersion?: string): Promise<SSM.DescribeDocumentResult> {
        const client = await this.createSdkClient()

        const request: SSM.Types.DescribeDocumentRequest = {
            Name: documentName,
            DocumentVersion: documentVersion,
        }

        return await client.describeDocument(request).promise()
    }

    public async getDocument(
        documentName: string,
        documentVersion?: string,
        documentFormat?: string
    ): Promise<SSM.Types.GetDocumentResult> {
        const client = await this.createSdkClient()

        const request: SSM.Types.GetDocumentRequest = {
            Name: documentName,
            DocumentVersion: documentVersion,
            DocumentFormat: documentFormat,
        }

        return await client.getDocument(request).promise()
    }

    public async createDocument(request: SSM.Types.CreateDocumentRequest): Promise<SSM.Types.CreateDocumentResult> {
        const client = await this.createSdkClient()

        return await client.createDocument(request).promise()
    }

    public async updateDocument(request: SSM.Types.UpdateDocumentRequest): Promise<SSM.Types.UpdateDocumentResult> {
        const client = await this.createSdkClient()

        return await client.updateDocument(request).promise()
    }

    public async updateDocumentVersion(
        documentName: string,
        documentVersion: string
    ): Promise<SSM.Types.UpdateDocumentDefaultVersionResult> {
        const client = await this.createSdkClient()

        const request: SSM.Types.UpdateDocumentDefaultVersionRequest = {
            Name: documentName,
            DocumentVersion: documentVersion,
        }

        return await client.updateDocumentDefaultVersion(request).promise()
    }

    private async createSdkClient(): Promise<SSM> {
        return await globals.sdkClientBuilder.createAwsService(SSM, undefined, this.regionCode)
    }
}
