/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { AWSError, Credentials, Service } from 'aws-sdk'
import globals from '../../shared/extensionGlobals'
import * as CodeWhispererClient from './codewhispererclient'
import * as CodeWhispererUserClient from './codewhispereruserclient'
import { ListAvailableCustomizationsResponse, SendTelemetryEventRequest } from './codewhispereruserclient'
import * as CodeWhispererConstants from '../models/constants'
import { ServiceOptions } from '../../shared/awsClientBuilder'
import { hasVendedIamCredentials } from '../../auth/auth'
import { CodeWhispererSettings } from '../util/codewhispererSettings'
import { PromiseResult } from 'aws-sdk/lib/request'
import { AuthUtil } from '../util/authUtil'
import { isSsoConnection } from '../../auth/connection'
import { pageableToCollection } from '../../shared/utilities/collectionUtils'
import apiConfig = require('./service-2.json')
import userApiConfig = require('./user-service-2.json')
import { session } from '../util/codeWhispererSession'
import { getLogger } from '../../shared/logger'
import { getOptOutPreference } from '../util/commonUtil'

export type ProgrammingLanguage = Readonly<
    CodeWhispererClient.ProgrammingLanguage | CodeWhispererUserClient.ProgrammingLanguage
>
export type FileContext = Readonly<CodeWhispererClient.FileContext | CodeWhispererUserClient.FileContext>
export type ListRecommendationsRequest = Readonly<
    CodeWhispererClient.ListRecommendationsRequest | CodeWhispererUserClient.GenerateCompletionsRequest
>
export type GenerateRecommendationsRequest = Readonly<CodeWhispererClient.GenerateRecommendationsRequest>
export type RecommendationsList = CodeWhispererClient.RecommendationsList | CodeWhispererUserClient.Completions
export type ListRecommendationsResponse =
    | CodeWhispererClient.ListRecommendationsResponse
    | CodeWhispererUserClient.GenerateCompletionsResponse
export type GenerateRecommendationsResponse = CodeWhispererClient.GenerateRecommendationsResponse
export type Recommendation = CodeWhispererClient.Recommendation | CodeWhispererUserClient.Completion
export type Completion = CodeWhispererUserClient.Completion
export type Reference = CodeWhispererClient.Reference | CodeWhispererUserClient.Reference
export type References = CodeWhispererClient.References | CodeWhispererUserClient.References
export type CreateUploadUrlRequest = Readonly<
    CodeWhispererClient.CreateUploadUrlRequest | CodeWhispererUserClient.CreateUploadUrlRequest
>
export type CreateCodeScanRequest = Readonly<
    CodeWhispererClient.CreateCodeScanRequest | CodeWhispererUserClient.StartCodeAnalysisRequest
>
export type GetCodeScanRequest = Readonly<
    CodeWhispererClient.GetCodeScanRequest | CodeWhispererUserClient.GetCodeAnalysisRequest
>
export type ListCodeScanFindingsRequest = Readonly<
    CodeWhispererClient.ListCodeScanFindingsRequest | CodeWhispererUserClient.ListCodeAnalysisFindingsRequest
>
export type SupplementalContext = Readonly<
    CodeWhispererClient.SupplementalContext | CodeWhispererUserClient.SupplementalContext
>
export type ArtifactType = Readonly<CodeWhispererClient.ArtifactType | CodeWhispererUserClient.ArtifactType>
export type ArtifactMap = Readonly<CodeWhispererClient.ArtifactMap | CodeWhispererUserClient.ArtifactMap>
export type ListCodeScanFindingsResponse =
    | CodeWhispererClient.ListCodeScanFindingsResponse
    | CodeWhispererUserClient.ListCodeAnalysisFindingsResponse
export type CreateUploadUrlResponse =
    | CodeWhispererClient.CreateUploadUrlResponse
    | CodeWhispererUserClient.CreateUploadUrlResponse
export type CreateCodeScanResponse =
    | CodeWhispererClient.CreateCodeScanResponse
    | CodeWhispererUserClient.StartCodeAnalysisResponse
export type Import = CodeWhispererUserClient.Import
export type Imports = CodeWhispererUserClient.Imports
export class DefaultCodeWhispererClient {
    private async createSdkClient(): Promise<CodeWhispererClient> {
        const isOptedOut = CodeWhispererSettings.instance.isOptoutEnabled()

        return (await globals.sdkClientBuilder.createAwsService(
            Service,
            {
                apiConfig: apiConfig,
                region: CodeWhispererConstants.region,
                credentials: await AuthUtil.instance.getCredentials(),
                endpoint: CodeWhispererConstants.endpoint,
                onRequestSetup: [
                    req => {
                        if (req.operation === 'listRecommendations') {
                            req.on('build', () => {
                                req.httpRequest.headers['x-amzn-codewhisperer-optout'] = `${isOptedOut}`
                            })
                        }
                        // This logic is for backward compatability with legacy SDK v2 behavior for refreshing
                        // credentials. Once the Toolkit adds a file watcher for credentials it won't be needed.

                        if (hasVendedIamCredentials()) {
                            req.on('retry', resp => {
                                if (
                                    resp.error?.code === 'AccessDeniedException' &&
                                    resp.error.message.match(/expired/i)
                                ) {
                                    AuthUtil.instance.reauthenticate()
                                    resp.error.retryable = true
                                }
                            })
                        }
                    },
                ],
            } as ServiceOptions,
            undefined
        )) as CodeWhispererClient
    }

    async createUserSdkClient(): Promise<CodeWhispererUserClient> {
        const isOptedOut = CodeWhispererSettings.instance.isOptoutEnabled()
        session.setFetchCredentialStart()
        const bearerToken = await AuthUtil.instance.getBearerToken()
        session.setSdkApiCallStart()
        return (await globals.sdkClientBuilder.createAwsService(
            Service,
            {
                apiConfig: userApiConfig,
                region: CodeWhispererConstants.region,
                endpoint: CodeWhispererConstants.endpoint,
                credentials: new Credentials({ accessKeyId: 'xxx', secretAccessKey: 'xxx' }),
                onRequestSetup: [
                    req => {
                        req.on('build', ({ httpRequest }) => {
                            httpRequest.headers['Authorization'] = `Bearer ${bearerToken}`
                        })
                        if (req.operation === 'generateCompletions') {
                            req.on('build', () => {
                                req.httpRequest.headers['x-amzn-codewhisperer-optout'] = `${isOptedOut}`
                            })
                        }
                    },
                ],
            } as ServiceOptions,
            undefined
        )) as CodeWhispererUserClient
    }

    private isBearerTokenAuth(): boolean {
        return isSsoConnection(AuthUtil.instance.conn)
    }

    public async generateRecommendations(
        request: GenerateRecommendationsRequest
    ): Promise<GenerateRecommendationsResponse> {
        return (await this.createSdkClient()).generateRecommendations(request).promise()
    }

    public async listRecommendations(request: ListRecommendationsRequest): Promise<ListRecommendationsResponse> {
        if (this.isBearerTokenAuth()) {
            return await (await this.createUserSdkClient()).generateCompletions(request).promise()
        }
        return (await this.createSdkClient()).listRecommendations(request).promise()
    }

    public async createUploadUrl(
        request: CreateUploadUrlRequest
    ): Promise<PromiseResult<CreateUploadUrlResponse, AWSError>> {
        if (this.isBearerTokenAuth()) {
            return (await this.createUserSdkClient()).createUploadUrl(request).promise()
        }
        return (await this.createSdkClient()).createCodeScanUploadUrl(request).promise()
    }

    public async createCodeScan(
        request: CreateCodeScanRequest
    ): Promise<PromiseResult<CreateCodeScanResponse, AWSError>> {
        if (this.isBearerTokenAuth()) {
            return (await this.createUserSdkClient()).startCodeAnalysis(request).promise()
        }
        return (await this.createSdkClient()).createCodeScan(request).promise()
    }

    public async getCodeScan(
        request: GetCodeScanRequest
    ): Promise<PromiseResult<CodeWhispererClient.GetCodeScanResponse, AWSError>> {
        if (this.isBearerTokenAuth()) {
            return (await this.createUserSdkClient()).getCodeAnalysis(request).promise()
        }
        return (await this.createSdkClient()).getCodeScan(request).promise()
    }

    public async listCodeScanFindings(
        request: ListCodeScanFindingsRequest
    ): Promise<PromiseResult<ListCodeScanFindingsResponse, AWSError>> {
        if (this.isBearerTokenAuth()) {
            const req = {
                jobId: request.jobId,
                nextToken: request.nextToken,
                codeAnalysisFindingsSchema: 'codeanalysis/findings/1.0',
            } as CodeWhispererUserClient.ListCodeAnalysisFindingsRequest
            return (await this.createUserSdkClient()).listCodeAnalysisFindings(req).promise()
        }
        return (await this.createSdkClient())
            .listCodeScanFindings(request as CodeWhispererClient.ListCodeScanFindingsRequest)
            .promise()
    }

    public async listAvailableCustomizations(): Promise<ListAvailableCustomizationsResponse[]> {
        const client = await this.createUserSdkClient()
        const requester = async (request: CodeWhispererUserClient.ListAvailableCustomizationsRequest) =>
            client.listAvailableCustomizations(request).promise()
        return pageableToCollection(requester, {}, 'nextToken').promise()
    }

    public async sendTelemetryEvent(request: SendTelemetryEventRequest) {
        const requestWithOptOut: SendTelemetryEventRequest = {
            ...request,
            optOutPreference: getOptOutPreference(),
        }
        if (!AuthUtil.instance.isValidEnterpriseSsoInUse() && !globals.telemetry.telemetryEnabled) {
            return
        }
        const response = await (await this.createUserSdkClient()).sendTelemetryEvent(requestWithOptOut).promise()
        getLogger().debug(`codewhisperer: sendTelemetryEvent requestID: ${response.$response.requestId}`)
    }
}

export const codeWhispererClient = new DefaultCodeWhispererClient()

export class CognitoCredentialsError extends Error {}
