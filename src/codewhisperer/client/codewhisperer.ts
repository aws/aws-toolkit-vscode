/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSError, CognitoIdentityCredentials, Service } from 'aws-sdk'
import apiConfig = require('./service-2.json')
import userApiConfig = require('./user-service-2.json')
import globals from '../../shared/extensionGlobals'
import * as CodeWhispererClient from './codewhispererclient'
import * as CodeWhispererUserClient from './codewhispereruserclient'
import * as CodeWhispererConstants from '../models/constants'
import { ServiceOptions } from '../../shared/awsClientBuilder'
import { invalidateAccessToken } from '../util/invalidateToken'
import { isCloud9 } from '../../shared/extensionUtilities'
import { CodeWhispererSettings } from '../util/codewhispererSettings'
import { getCognitoCredentials } from '../util/cognitoIdentity'
import { PromiseResult } from 'aws-sdk/lib/request'
import { getLogger } from '../../shared/logger'
import { throttle } from 'lodash'
import { Credentials } from 'aws-sdk'
import { AuthUtil } from '../util/authUtil'
import { TelemetryHelper } from '../util/telemetryHelper'

const refreshCredentials = throttle(() => {
    getLogger().verbose('codewhisperer: invalidating expired credentials')
    globals.awsContext.credentialsShim?.refresh()
}, 60000)

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

export class DefaultCodeWhispererClient {
    private credentials?: CognitoIdentityCredentials

    private async createSdkClient(): Promise<CodeWhispererClient> {
        try {
            if (!this.credentials && !isCloud9()) {
                this.credentials = await getCognitoCredentials()
            }
            if (this.credentials && this.credentials.needsRefresh()) {
                await new Promise<void>((resolve, reject) =>
                    this.credentials?.refresh(e => (e ? reject(e) : resolve()))
                )
            }
        } catch (e) {
            getLogger().debug('Error when getting or refreshing Cognito credentials', e)
            throw new CognitoCredentialsError('Error when getting or refreshing Cognito credentials')
        }

        const accessToken = globals.context.globalState.get<string | undefined>(CodeWhispererConstants.accessToken)
        const isOptedOut = CodeWhispererSettings.instance.isOptoutEnabled()

        return (await globals.sdkClientBuilder.createAwsService(
            Service,
            {
                apiConfig: apiConfig,
                region: CodeWhispererConstants.region,
                credentials: this.credentials,
                endpoint: CodeWhispererConstants.endpoint,
                onRequestSetup: [
                    req => {
                        if (!isCloud9() && req.operation !== 'getAccessToken') {
                            req.on('build', () => {
                                req.httpRequest.headers['x-amzn-codewhisperer-token'] = accessToken || ''
                            })
                            req.on('error', e => {
                                if (e.code === 'AccessDeniedException') {
                                    invalidateAccessToken()
                                }
                            })
                        }
                        if (req.operation === 'listRecommendations') {
                            req.on('build', () => {
                                req.httpRequest.headers['x-amzn-codewhisperer-optout'] = `${isOptedOut}`
                            })
                        }

                        // This logic is for backward compatability with legacy SDK v2 behavior for refreshing
                        // credentials. Once the Toolkit adds a file watcher for credentials it won't be needed.
                        if (isCloud9() && req.operation !== 'getAccessToken') {
                            req.on('retry', resp => {
                                if (
                                    resp.error?.code === 'AccessDeniedException' &&
                                    resp.error.message.match(/expired/i)
                                ) {
                                    refreshCredentials()
                                    resp.error.retryable = true
                                }
                            })
                        }
                    },
                ],
            } as ServiceOptions,
            undefined,
            false
        )) as CodeWhispererClient
    }

    async createUserSdkClient(): Promise<CodeWhispererUserClient> {
        const isOptedOut = CodeWhispererSettings.instance.isOptoutEnabled()
        TelemetryHelper.instance.setFetchCredentialStartTime()
        const bearerToken = await AuthUtil.instance.getBearerToken()
        TelemetryHelper.instance.setSdkApiCallStartTime()
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
            undefined,
            false
        )) as CodeWhispererUserClient
    }

    private isBearerTokenAuth(): boolean {
        // return true if access token is cleared because of SSO code path
        const accessToken = globals.context.globalState.get<string | undefined>(CodeWhispererConstants.accessToken)
        if (!accessToken) {
            return true
        }
        return AuthUtil.instance.isConnected()
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

    public async getAccessToken(
        request: CodeWhispererClient.GetAccessTokenRequest
    ): Promise<CodeWhispererClient.GetAccessTokenResponse> {
        return (await this.createSdkClient()).getAccessToken(request).promise()
    }

    public async createUploadUrl(
        request: CreateUploadUrlRequest
    ): Promise<PromiseResult<CreateUploadUrlResponse, AWSError>> {
        if (this.isBearerTokenAuth()) {
            return (await this.createUserSdkClient()).createArtifactUploadUrl(request).promise()
        }
        return (await this.createSdkClient()).createUploadUrl(request).promise()
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
}

export class CognitoCredentialsError extends Error {}
