/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSError, Credentials, Service } from 'aws-sdk'
import globals from '../../shared/extensionGlobals'
import * as CodeWhispererClient from './codewhispererclient'
import * as CodeWhispererUserClient from './codewhispereruserclient'
import {
    ListAvailableCustomizationsResponse,
    ListFeatureEvaluationsRequest,
    ListFeatureEvaluationsResponse,
    SendTelemetryEventRequest,
} from './codewhispereruserclient'
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
import { indent } from '../../shared/utilities/textUtilities'
import { keepAliveHeader } from './agent'
import { getOptOutPreference } from '../util/commonUtil'
import * as os from 'os'
import { getClientId } from '../../shared/telemetry/util'
import { extensionVersion, getServiceEnvVarConfig } from '../../shared/vscode/env'
import { DevSettings } from '../../shared/settings'

export interface CodeWhispererConfig {
    readonly region: string
    readonly endpoint: string
}

export const defaultServiceConfig: CodeWhispererConfig = {
    region: 'us-west-2',
    endpoint: 'https://rts.gamma-us-west-2.codewhisperer.ai.aws.dev/',
}

export function getCodewhispererConfig(): CodeWhispererConfig {
    return {
        ...DevSettings.instance.getServiceConfig('codewhispererService', defaultServiceConfig),

        // Environment variable overrides
        ...getServiceEnvVarConfig('codewhisperer', Object.keys(defaultServiceConfig)),
    }
}

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
        const cwsprConfig = getCodewhispererConfig()
        return (await globals.sdkClientBuilder.createAwsService(
            Service,
            {
                apiConfig: apiConfig,
                region: cwsprConfig.region,
                credentials: await AuthUtil.instance.getCredentials(),
                endpoint: cwsprConfig.endpoint,
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
                                    AuthUtil.instance.reauthenticate().catch(e => {
                                        getLogger().error('reauthenticate failed: %s', (e as Error).message)
                                    })
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
        const cwsprConfig = getCodewhispererConfig()
        return (await globals.sdkClientBuilder.createAwsService(
            Service,
            {
                apiConfig: userApiConfig,
                region: cwsprConfig.region,
                endpoint: cwsprConfig.endpoint,
                credentials: new Credentials({ accessKeyId: 'xxx', secretAccessKey: 'xxx' }),
                onRequestSetup: [
                    req => {
                        req.on('build', ({ httpRequest }) => {
                            httpRequest.headers['Authorization'] = `Bearer ${bearerToken}`
                        })
                        if (req.operation === 'generateCompletions') {
                            req.on('build', () => {
                                req.httpRequest.headers['x-amzn-codewhisperer-optout'] = `${isOptedOut}`
                                req.httpRequest.headers['Connection'] = keepAliveHeader
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
        return pageableToCollection(requester, {}, 'nextToken')
            .promise()
            .then(resps => {
                let logStr = 'CodeWhisperer: listAvailableCustomizations API request:'
                resps.forEach(resp => {
                    const requestId = resp.$response.requestId
                    logStr += `\n${indent('RequestID: ', 4)}${requestId},\n${indent('Customizations:', 4)}`
                    resp.customizations.forEach((c, index) => {
                        const entry = `${index.toString().padStart(2, '0')}: ${c.name?.trim()}`
                        logStr += `\n${indent(entry, 8)}`
                    })
                })
                getLogger().debug(logStr)
                return resps
            })
    }

    public async sendTelemetryEvent(request: SendTelemetryEventRequest) {
        const requestWithCommonFields: SendTelemetryEventRequest = {
            ...request,
            optOutPreference: getOptOutPreference(),
            userContext: {
                ideCategory: 'VSCODE',
                operatingSystem: this.getOperatingSystem(),
                product: 'CodeWhisperer',
                clientId: await getClientId(globals.context.globalState),
                ideVersion: extensionVersion,
            },
        }
        if (!AuthUtil.instance.isValidEnterpriseSsoInUse() && !globals.telemetry.telemetryEnabled) {
            return
        }
        const response = await (await this.createUserSdkClient()).sendTelemetryEvent(requestWithCommonFields).promise()
        getLogger().debug(`codewhisperer: sendTelemetryEvent requestID: ${response.$response.requestId}`)
    }

    public async listFeatureEvaluations(): Promise<ListFeatureEvaluationsResponse> {
        const request: ListFeatureEvaluationsRequest = {
            userContext: {
                ideCategory: 'VSCODE',
                operatingSystem: this.getOperatingSystem(),
                product: 'CodeWhisperer',
                clientId: await getClientId(globals.context.globalState),
                ideVersion: extensionVersion,
            },
        }
        return (await this.createUserSdkClient()).listFeatureEvaluations(request).promise()
    }

    private getOperatingSystem(): string {
        const osId = os.platform() // 'darwin', 'win32', 'linux', etc.
        if (osId === 'darwin') {
            return 'MAC'
        } else if (osId === 'win32') {
            return 'WINDOWS'
        } else {
            return 'LINUX'
        }
    }

    /**
     * @description Use this function to start the transformation job.
     * @param request
     * @returns transformationJobId - String id for the Job
     */
    public async codeModernizerStartCodeTransformation(
        request: CodeWhispererUserClient.StartTransformationRequest
    ): Promise<PromiseResult<CodeWhispererUserClient.StartTransformationResponse, AWSError>> {
        return (await this.createUserSdkClient()).startTransformation(request).promise()
    }

    /**
     * @description Use this function to stop the transformation job.
     * @param request
     * @returns transformationJobId - String id for the Job
     */
    public async codeModernizerStopCodeTransformation(
        request: CodeWhispererUserClient.StopTransformationRequest
    ): Promise<PromiseResult<CodeWhispererUserClient.StopTransformationResponse, AWSError>> {
        return (await this.createUserSdkClient()).stopTransformation(request).promise()
    }

    /**
     * @description Use this function to get the status of the code transformation. We should
     * be polling this function periodically to get updated results. When this function
     * returns COMPLETED we know the transformation is done.
     */
    public async codeModernizerGetCodeTransformation(
        request: CodeWhispererUserClient.GetTransformationRequest
    ): Promise<PromiseResult<CodeWhispererUserClient.GetTransformationResponse, AWSError>> {
        return (await this.createUserSdkClient()).getTransformation(request).promise()
    }

    /**
     * @description After the job has been PAUSED we need to get user intervention. Once that user
     * intervention has been handled we can resume the transformation job.
     * @params transformationJobId - String id returned from StartCodeTransformationResponse
     * @params userActionStatus - String to determine what action the user took, if any.
     */
    public async codeModernizerResumeTransformation(
        request: CodeWhispererUserClient.ResumeTransformationRequest
    ): Promise<PromiseResult<CodeWhispererUserClient.ResumeTransformationResponse, AWSError>> {
        return (await this.createUserSdkClient()).resumeTransformation(request).promise()
    }

    /**
     * @description After starting a transformation use this function to display the LLM
     * transformation plan to the user.
     * @params transformationJobId - String id returned from StartCodeTransformationResponse
     */
    public async codeModernizerGetCodeTransformationPlan(
        request: CodeWhispererUserClient.GetTransformationPlanRequest
    ): Promise<PromiseResult<CodeWhispererUserClient.GetTransformationPlanResponse, AWSError>> {
        return (await this.createUserSdkClient()).getTransformationPlan(request).promise()
    }
}

export const codeWhispererClient = new DefaultCodeWhispererClient()

export class CognitoCredentialsError extends Error {}
