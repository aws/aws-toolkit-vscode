/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as CodeWhispererClient from '@aws-sdk/client-codewhisperer'
import * as CodeWhispererUserClient from '@aws-sdk/client-codewhispererruntime'
import * as CodeWhispererConstants from '../models/constants'
import { createAwsService2 } from '../../shared/awsClientBuilder'
import { CodeWhispererSettings } from '../util/codewhispererSettings'
import { AuthUtil } from '../util/authUtil'
import { TelemetryHelper } from '../util/telemetryHelper'
import { isSsoConnection } from '../../auth/connection'
import { HttpRequest } from '@aws-sdk/protocol-http'

export type ProgrammingLanguage = Readonly<
    CodeWhispererClient.ProgrammingLanguage | CodeWhispererUserClient.ProgrammingLanguage
>
type _FileContext = Readonly<CodeWhispererClient.FileContext | CodeWhispererUserClient.FileContext>
export type FileContext = { [P in keyof _FileContext]-?: NonNullable<_FileContext[P]> }

type _ListRecommendationsRequest = Readonly<
    CodeWhispererClient.GenerateRecommendationsRequest | CodeWhispererUserClient.GenerateCompletionsRequest
>

export type ListRecommendationsRequest = Omit<_ListRecommendationsRequest, 'fileContext'> & {
    fileContext: FileContext
}
type _GenerateRecommendationsRequest = Readonly<CodeWhispererClient.GenerateRecommendationsRequest>
export type GenerateRecommendationsRequest = Omit<_GenerateRecommendationsRequest, 'fileContext'> & {
    fileContext: FileContext
}

export type RecommendationsList = Recommendation[] | Recommendation[]
export type ListRecommendationsResponse =
    | CodeWhispererClient.GenerateRecommendationsRequest
    | CodeWhispererUserClient.GenerateCompletionsResponse
export type GenerateRecommendationsResponse = CodeWhispererClient.GenerateRecommendationsResponse
export type Recommendation = (CodeWhispererClient.Recommendation | CodeWhispererUserClient.Completion) & {
    content: string
}
export type Completion = CodeWhispererUserClient.Completion
export type Reference = CodeWhispererClient.Reference | CodeWhispererUserClient.Reference
export type References = CodeWhispererClient.Reference[] | CodeWhispererUserClient.Reference[]
export type CreateUploadUrlRequest = Readonly<CodeWhispererUserClient.CreateUploadUrlRequest> // NOT SUPPORTED VIA SIGV4
export type CreateCodeScanRequest = Readonly<CodeWhispererUserClient.StartCodeAnalysisRequest> // NOT SUPPORTED VIA SIGV4
export type GetCodeScanRequest = Readonly<CodeWhispererUserClient.GetCodeAnalysisRequest> // NOT SUPPORTED VIA SIGV4
export type ListCodeScanFindingsRequest = Readonly<CodeWhispererUserClient.ListCodeAnalysisFindingsRequest> // NOT SUPPORTED VIA SIGV4
export type SupplementalContext = Readonly<
    CodeWhispererClient.SupplementalContext | CodeWhispererUserClient.SupplementalContext
>
export type ArtifactType = Readonly<CodeWhispererUserClient.ArtifactType>
export type ArtifactMap = Readonly<Record<string, CodeWhispererUserClient.ArtifactType>>
export type ListCodeScanFindingsResponse = CodeWhispererUserClient.ListCodeAnalysisFindingsResponse // NOT SUPPORTED VIA SIGV4
export type CreateUploadUrlResponse = CodeWhispererUserClient.CreateUploadUrlResponse // NOT SUPPORTED VIA SIGV4
export type CreateCodeScanResponse = CodeWhispererUserClient.StartCodeAnalysisResponse // NOT SUPPORTED VIA SIGV4
export type Import = CodeWhispererUserClient.Import
export type Imports = CodeWhispererUserClient.Import[]
export class DefaultCodeWhispererClient {
    private async createSdkClient(): Promise<CodeWhispererClient.CodeWhisperer> {
        const isOptedOut = CodeWhispererSettings.instance.isOptoutEnabled()

        return createAwsService2(CodeWhispererClient.CodeWhisperer, {
            region: CodeWhispererConstants.region,
            credentials: () => AuthUtil.instance.getCredentials(),
            endpoint: CodeWhispererConstants.endpoint,
            middleware: [
                [
                    (next, context) => args => {
                        const op = (context as { commandName?: string }).commandName
                        if (op === 'ListRecommendationsCommand' && HttpRequest.isInstance(args.request)) {
                            args.request.headers['x-amzn-codewhisperer-optout'] = `${isOptedOut}`
                        }

                        // This logic is for backward compatability with legacy SDK v2 behavior for refreshing
                        // credentials. Once the Toolkit adds a file watcher for credentials it won't be needed.
                        // if (isCloud9()) {
                        //     req.on('retry', resp => {
                        //         if (
                        //             resp.error?.code === 'AccessDeniedException' &&
                        //             resp.error.message.match(/expired/i)
                        //         ) {
                        //             AuthUtil.instance.reauthenticate()
                        //             resp.error.retryable = true
                        //         }
                        //     })
                        // }

                        return next(args)
                    },
                    { step: 'build' },
                ],
            ],
        })
    }

    async createUserSdkClient(): Promise<CodeWhispererUserClient.CodeWhispererRuntime> {
        const isOptedOut = CodeWhispererSettings.instance.isOptoutEnabled()
        TelemetryHelper.instance.setFetchCredentialStartTime()
        TelemetryHelper.instance.setSdkApiCallStartTime()
        return createAwsService2(CodeWhispererUserClient.CodeWhispererRuntime, {
            region: CodeWhispererConstants.region,
            endpoint: CodeWhispererConstants.endpoint,
            token: async () => ({
                token: await AuthUtil.instance.getBearerToken(),
            }),
            middleware: [
                [
                    (next, context) => args => {
                        const op = (context as { commandName?: string }).commandName
                        if (op === 'GenerateCompletionsCommand' && HttpRequest.isInstance(args.request)) {
                            args.request.headers['x-amzn-codewhisperer-optout'] = `${isOptedOut}`
                        }

                        return next(args)
                    },
                    { step: 'build' },
                ],
            ],
        })
    }

    private isBearerTokenAuth(): boolean {
        return isSsoConnection(AuthUtil.instance.conn)
    }

    public async generateRecommendations(
        request: GenerateRecommendationsRequest
    ): Promise<GenerateRecommendationsResponse> {
        return (await this.createSdkClient()).generateRecommendations(request)
    }

    public async listRecommendations(request: ListRecommendationsRequest): Promise<ListRecommendationsResponse> {
        if (this.isBearerTokenAuth()) {
            return await (await this.createUserSdkClient()).generateCompletions(request)
        }
        return (await this.createSdkClient()).generateRecommendations(request)
    }

    public async createUploadUrl(request: CreateUploadUrlRequest): Promise<CreateUploadUrlResponse> {
        if (this.isBearerTokenAuth()) {
            return (await this.createUserSdkClient()).createUploadUrl(request)
        }

        throw new Error('Operation not supported')
    }

    public async createCodeScan(request: CreateCodeScanRequest): Promise<CreateCodeScanResponse> {
        if (this.isBearerTokenAuth()) {
            return (await this.createUserSdkClient()).startCodeAnalysis(request)
        }

        throw new Error('Operation not supported')
    }

    public async getCodeScan(
        request: GetCodeScanRequest
    ): Promise<CodeWhispererUserClient.GetCodeAnalysisCommandOutput> {
        if (this.isBearerTokenAuth()) {
            return (await this.createUserSdkClient()).getCodeAnalysis(request)
        }

        throw new Error('Operation not supported')
    }

    public async listCodeScanFindings(request: ListCodeScanFindingsRequest): Promise<ListCodeScanFindingsResponse> {
        if (this.isBearerTokenAuth()) {
            const req = {
                jobId: request.jobId,
                nextToken: request.nextToken,
                codeAnalysisFindingsSchema: 'codeanalysis/findings/1.0',
            } as CodeWhispererUserClient.ListCodeAnalysisFindingsRequest
            return (await this.createUserSdkClient()).listCodeAnalysisFindings(req)
        }

        throw new Error('Operation not supported')
    }
}

export class CognitoCredentialsError extends Error {}
