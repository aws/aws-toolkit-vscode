/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    CreateDocumentCommand,
    CreateDocumentRequest,
    CreateDocumentResult,
    DeleteDocumentCommand,
    DeleteDocumentRequest,
    DeleteDocumentResult,
    DescribeDocumentCommand,
    DescribeDocumentRequest,
    DescribeDocumentResult,
    DocumentFormat,
    DocumentIdentifier,
    DocumentVersionInfo,
    GetDocumentCommand,
    GetDocumentRequest,
    GetDocumentResult,
    ListDocumentsCommand,
    ListDocumentsRequest,
    ListDocumentsResult,
    ListDocumentVersionsCommand,
    ListDocumentVersionsRequest,
    ListDocumentVersionsResult,
    SSMClient,
    UpdateDocumentCommand,
    UpdateDocumentDefaultVersionCommand,
    UpdateDocumentDefaultVersionRequest,
    UpdateDocumentDefaultVersionResult,
    UpdateDocumentRequest,
    UpdateDocumentResult,
} from '@aws-sdk/client-ssm'
import globals from '../extensionGlobals'

import { ClassToInterfaceType } from '../utilities/tsUtils'

export type SsmDocumentClient = ClassToInterfaceType<DefaultSsmDocumentClient>
export class DefaultSsmDocumentClient {
    public constructor(public readonly regionCode: string) {}

    public async deleteDocument(documentName: string): Promise<DeleteDocumentResult> {
        const client = this.createSdkClient()

        const request: DeleteDocumentRequest = {
            Name: documentName,
        }

        return await client.send(new DeleteDocumentCommand(request))
    }

    public async *listDocuments(request: ListDocumentsRequest = {}): AsyncIterableIterator<DocumentIdentifier> {
        const client = this.createSdkClient()

        do {
            const response: ListDocumentsResult = await client.send(new ListDocumentsCommand(request))

            if (response.DocumentIdentifiers) {
                yield* response.DocumentIdentifiers
            }

            request.NextToken = response.NextToken
        } while (request.NextToken)
    }

    public async *listDocumentVersions(documentName: string): AsyncIterableIterator<DocumentVersionInfo> {
        const client = this.createSdkClient()

        const request: ListDocumentVersionsRequest = {
            Name: documentName,
        }

        do {
            const response: ListDocumentVersionsResult = await client.send(new ListDocumentVersionsCommand(request))

            if (response.DocumentVersions) {
                yield* response.DocumentVersions
            }

            request.NextToken = response.NextToken
        } while (request.NextToken)
    }

    public async describeDocument(documentName: string, documentVersion?: string): Promise<DescribeDocumentResult> {
        const client = this.createSdkClient()

        const request: DescribeDocumentRequest = {
            Name: documentName,
            DocumentVersion: documentVersion,
        }

        return await client.send(new DescribeDocumentCommand(request))
    }

    public async getDocument(
        documentName: string,
        documentVersion?: string,
        documentFormat?: DocumentFormat
    ): Promise<GetDocumentResult> {
        const client = this.createSdkClient()

        const request: GetDocumentRequest = {
            Name: documentName,
            DocumentVersion: documentVersion,
            DocumentFormat: documentFormat,
        }

        return await client.send(new GetDocumentCommand(request))
    }

    public async createDocument(request: CreateDocumentRequest): Promise<CreateDocumentResult> {
        const client = this.createSdkClient()

        return await client.send(new CreateDocumentCommand(request))
    }

    public async updateDocument(request: UpdateDocumentRequest): Promise<UpdateDocumentResult> {
        const client = this.createSdkClient()

        return await client.send(new UpdateDocumentCommand(request))
    }

    public async updateDocumentVersion(
        documentName: string,
        documentVersion: string
    ): Promise<UpdateDocumentDefaultVersionResult> {
        const client = this.createSdkClient()

        const request: UpdateDocumentDefaultVersionRequest = {
            Name: documentName,
            DocumentVersion: documentVersion,
        }

        return await client.send(new UpdateDocumentDefaultVersionCommand(request))
    }

    private createSdkClient(): SSMClient {
        return globals.sdkClientBuilderV3.createAwsService({
            serviceClient: SSMClient,
            clientOptions: { region: this.regionCode },
        })
    }
}
