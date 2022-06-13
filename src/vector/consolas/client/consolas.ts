/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSError, Service } from 'aws-sdk'
import apiConfig = require('./service-2.json')
import globals from '../../../shared/extensionGlobals'
import * as ConsolasClient from './consolasclient'
import { ConsolasConstants } from '../models/constants'
import { ServiceOptions } from '../../../shared/awsClientBuilder'
import { invalidateAccessToken } from '../util/invalidateToken'
import { isCloud9 } from '../../../shared/extensionUtilities'
import { ConsolasSettings } from '../util/consolasSettings'
import { getCognitoCredentials } from '../util/cognitoIdentity'
import { PromiseResult } from 'aws-sdk/lib/request'

export type ConsolasProgLang = Readonly<ConsolasClient.ProgrammingLanguage>
export type ConsolasFileContext = Readonly<ConsolasClient.FileContext>
export type ListRecommendationsRequest = Readonly<ConsolasClient.ListRecommendationsRequest>
export type GenerateRecommendationsRequest = Readonly<ConsolasClient.GenerateRecommendationsRequest>
export type RecommendationsList = ConsolasClient.RecommendationsList
export type ListRecommendationsResponse = ConsolasClient.ListRecommendationsResponse
export type GenerateRecommendationsResponse = ConsolasClient.GenerateRecommendationsResponse
export type Recommendation = ConsolasClient.Recommendation
export type Reference = ConsolasClient.Reference
export type References = ConsolasClient.References
export type CreateUploadUrlRequest = Readonly<ConsolasClient.CreateUploadUrlRequest>
export type CreateCodeScanRequest = Readonly<ConsolasClient.CreateCodeScanRequest>
export type GetCodeScanRequest = Readonly<ConsolasClient.GetCodeScanRequest>
export type ListCodeScanFindingsRequest = Readonly<ConsolasClient.ListCodeScanFindingsRequest>
export type ArtifactType = Readonly<ConsolasClient.ArtifactType>
export type ArtifactMap = Readonly<ConsolasClient.ArtifactMap>
export class DefaultConsolasClient {
    private async createSdkClient(): Promise<ConsolasClient> {
        const credentials = isCloud9() ? await globals.awsContext.getCredentials() : await getCognitoCredentials()
        const accessToken = globals.context.globalState.get<string | undefined>(ConsolasConstants.accessToken)
        const isOptedOut = ConsolasSettings.instance.isOptoutEnabled()

        return (await globals.sdkClientBuilder.createAwsService(
            Service,
            {
                apiConfig: apiConfig,
                region: ConsolasConstants.region,
                credentials: credentials,
                endpoint: ConsolasConstants.prodEndpoint,
                onRequestSetup: [
                    req => {
                        if (!isCloud9() && req.operation !== 'getAccessToken') {
                            req.on('build', () => {
                                req.httpRequest.headers['x-amzn-consolas-token'] = accessToken || ''
                            })
                            req.on('error', e => {
                                if (
                                    e.code === 'ValidationException' &&
                                    e.message.includes('Exception occured while validating the token')
                                ) {
                                    invalidateAccessToken()
                                }
                            })
                        }
                        if (req.operation === 'listRecommendations') {
                            req.on('build', () => {
                                req.httpRequest.headers['x-amzn-consolas-optout'] = `${isOptedOut}`
                            })
                        }
                    },
                ],
            } as ServiceOptions,
            undefined,
            false
        )) as ConsolasClient
    }

    public async generateRecommendations(
        request: ConsolasClient.GenerateRecommendationsRequest
    ): Promise<ConsolasClient.GenerateRecommendationsResponse> {
        return (await this.createSdkClient()).generateRecommendations(request).promise()
    }

    public async listRecommendations(
        request: ConsolasClient.ListRecommendationsRequest
    ): Promise<ConsolasClient.ListRecommendationsResponse> {
        return (await this.createSdkClient()).listRecommendations(request).promise()
    }

    public async getAccessToken(
        request: ConsolasClient.GetAccessTokenRequest
    ): Promise<ConsolasClient.GetAccessTokenResponse> {
        return (await this.createSdkClient()).getAccessToken(request).promise()
    }

    public async createUploadUrl(
        request: ConsolasClient.CreateUploadUrlRequest
    ): Promise<PromiseResult<ConsolasClient.CreateUploadUrlResponse, AWSError>> {
        return (await this.createSdkClient()).createUploadUrl(request).promise()
    }

    public async createCodeScan(
        request: ConsolasClient.CreateCodeScanRequest
    ): Promise<PromiseResult<ConsolasClient.CreateCodeScanResponse, AWSError>> {
        return (await this.createSdkClient()).createCodeScan(request).promise()
    }

    public async getCodeScan(
        request: ConsolasClient.GetCodeScanRequest
    ): Promise<PromiseResult<ConsolasClient.GetCodeScanResponse, AWSError>> {
        return (await this.createSdkClient()).getCodeScan(request).promise()
    }

    public async listCodeScanFindings(
        request: ConsolasClient.ListCodeScanFindingsRequest
    ): Promise<PromiseResult<ConsolasClient.ListCodeScanFindingsResponse, AWSError>> {
        return (await this.createSdkClient()).listCodeScanFindings(request).promise()
    }
}
