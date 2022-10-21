/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSError, CognitoIdentityCredentials, Service } from 'aws-sdk'
import apiConfig = require('./service-2.json')
import globals from '../../shared/extensionGlobals'
import * as CodeWhispererClient from './codewhispererclient'
import * as CodeWhispererConstants from '../models/constants'
import { ServiceOptions } from '../../shared/awsClientBuilder'
import { invalidateAccessToken } from '../util/invalidateToken'
import { isCloud9 } from '../../shared/extensionUtilities'
import { CodeWhispererSettings } from '../util/codewhispererSettings'
import { getCognitoCredentials } from '../util/cognitoIdentity'
import { PromiseResult } from 'aws-sdk/lib/request'
import { getLogger } from '../../shared/logger'
import { throttle } from 'lodash'

const refreshCredentials = throttle(() => {
    getLogger().verbose('codewhisperer: invalidating expired credentials')
    globals.awsContext.credentialsShim?.refresh()
}, 60000)

export type ProgrammingLanguage = Readonly<CodeWhispererClient.ProgrammingLanguage>
export type FileContext = Readonly<CodeWhispererClient.FileContext>
export type ListRecommendationsRequest = Readonly<CodeWhispererClient.ListRecommendationsRequest>
export type GenerateRecommendationsRequest = Readonly<CodeWhispererClient.GenerateRecommendationsRequest>
export type RecommendationsList = CodeWhispererClient.RecommendationsList
export type ListRecommendationsResponse = CodeWhispererClient.ListRecommendationsResponse
export type GenerateRecommendationsResponse = CodeWhispererClient.GenerateRecommendationsResponse
export type Recommendation = CodeWhispererClient.Recommendation
export type Reference = CodeWhispererClient.Reference
export type References = CodeWhispererClient.References
export type CreateUploadUrlRequest = Readonly<CodeWhispererClient.CreateUploadUrlRequest>
export type CreateCodeScanRequest = Readonly<CodeWhispererClient.CreateCodeScanRequest>
export type GetCodeScanRequest = Readonly<CodeWhispererClient.GetCodeScanRequest>
export type ListCodeScanFindingsRequest = Readonly<CodeWhispererClient.ListCodeScanFindingsRequest>
export type ArtifactType = Readonly<CodeWhispererClient.ArtifactType>
export type ArtifactMap = Readonly<CodeWhispererClient.ArtifactMap>
export class DefaultCodeWhispererClient {
    private credentials?: CognitoIdentityCredentials

    private async createSdkClient(): Promise<CodeWhispererClient> {
        try {
            if (!this.credentials && !isCloud9()) {
                this.credentials = await getCognitoCredentials()
            }
            if (this.credentials && this.credentials?.needsRefresh()) {
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

    public async generateRecommendations(
        request: CodeWhispererClient.GenerateRecommendationsRequest
    ): Promise<CodeWhispererClient.GenerateRecommendationsResponse> {
        return (await this.createSdkClient()).generateRecommendations(request).promise()
    }

    public async listRecommendations(
        request: CodeWhispererClient.ListRecommendationsRequest
    ): Promise<CodeWhispererClient.ListRecommendationsResponse> {
        return (await this.createSdkClient()).listRecommendations(request).promise()
    }

    public async getAccessToken(
        request: CodeWhispererClient.GetAccessTokenRequest
    ): Promise<CodeWhispererClient.GetAccessTokenResponse> {
        return (await this.createSdkClient()).getAccessToken(request).promise()
    }

    public async createUploadUrl(
        request: CodeWhispererClient.CreateUploadUrlRequest
    ): Promise<PromiseResult<CodeWhispererClient.CreateUploadUrlResponse, AWSError>> {
        return (await this.createSdkClient()).createUploadUrl(request).promise()
    }

    public async createCodeScan(
        request: CodeWhispererClient.CreateCodeScanRequest
    ): Promise<PromiseResult<CodeWhispererClient.CreateCodeScanResponse, AWSError>> {
        return (await this.createSdkClient()).createCodeScan(request).promise()
    }

    public async getCodeScan(
        request: CodeWhispererClient.GetCodeScanRequest
    ): Promise<PromiseResult<CodeWhispererClient.GetCodeScanResponse, AWSError>> {
        return (await this.createSdkClient()).getCodeScan(request).promise()
    }

    public async listCodeScanFindings(
        request: CodeWhispererClient.ListCodeScanFindingsRequest
    ): Promise<PromiseResult<CodeWhispererClient.ListCodeScanFindingsResponse, AWSError>> {
        return (await this.createSdkClient()).listCodeScanFindings(request).promise()
    }
}

export class CognitoCredentialsError extends Error {}
