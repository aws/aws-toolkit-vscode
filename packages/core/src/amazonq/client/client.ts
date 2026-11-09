/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServiceOptions } from '../../shared/awsClientBuilder'

export abstract class FeatureClient {
    public abstract getClient(options?: Partial<ServiceOptions>): Promise<any>

    public abstract createConversation(): Promise<string>

    public abstract createUploadUrl(
        conversationId: string,
        contentChecksumSha256: string,
        contentLength: number,
        uploadId: string
    ): Promise<any>

    public abstract startCodeGeneration(
        conversationId: string,
        uploadId: string,
        message: string,
        intent: any,
        codeGenerationId: string,
        currentCodeGenerationId?: string,
        intentContext?: any
    ): Promise<any>

    public abstract getCodeGeneration(conversationId: string, codeGenerationId: string): Promise<any>

    public abstract exportResultArchive(conversationId: string): Promise<any>
}
