/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// import * as vscode from 'vscode'
import * as fs from 'fs'
import { fromContainerMetadata } from '@aws-sdk/credential-provider-imds'
import { Service } from 'aws-sdk'
import globals from '../../extensionGlobals'
import SageMakerClient, { DescribeDomainRequest, DescribeDomainResponse } from './sagemakerclient'
import apiConfig = require('./service-2.json')
import { ServiceOptions } from '../../awsClientBuilder'

export interface SageMakerCookie {
    authMode?: 'Sso' | 'Iam'
    expiryTime?: number
    ssoExpiryTimestamp?: number
    studioUserProfileName?: string
    redirectURL?: string
    AccessToken?: string
    StudioSessionToken?: string
}

// Manually expire the token every 5 minutes as token refresh is handled externally by Sagemaker
const TOKEN_EXPIRY = 5 * 60 * 1000
const DEFAULT_REGION = 'us-east-1'

export class DefaultSageMakerClient {
    constructor(private readonly region: string) {}

    private async createSdkClient(): Promise<SageMakerClient> {
        return (await globals.sdkClientBuilder.createAwsService(
            Service,
            {
                apiConfig: apiConfig,
                region: this.region,
                credentials: await fromContainerMetadata()(),
                endpoint: `https://api.sagemaker.${this.region}.amazonaws.com`,
            } as ServiceOptions,
            undefined
        )) as SageMakerClient
    }

    public async describeDomain(request: DescribeDomainRequest): Promise<DescribeDomainResponse> {
        return await (await this.createSdkClient()).describeDomain(request).promise()
    }
}

/**
 * Client that provides utilities to fetch information related to
 * the current domain & container space.
 */
export class SageMakerSpaceClient {
    private static _instance: SageMakerSpaceClient | undefined

    private cachedCookies: SageMakerCookie | undefined = undefined
    private cachedProfileArn: string | undefined = undefined
    private sageMakerClient: DefaultSageMakerClient

    private constructor(sageMakerClient?: DefaultSageMakerClient) {
        this.sageMakerClient = sageMakerClient ?? new DefaultSageMakerClient(this.getDefaultRegion())
    }

    public static getQConnectionScopes() {
        return ['codewhisperer:completions', 'codewhisperer:conversations']
    }

    public static getInstance(): SageMakerSpaceClient {
        if (!this._instance) {
            this._instance = new SageMakerSpaceClient()
        }
        return this._instance
    }

    public getDefaultRegion(): string {
        return process.env['AWS_REGION'] ?? DEFAULT_REGION
    }

    private async isSsoUser(): Promise<boolean> {
        return (await this.getSageMakerCookies())?.authMode === 'Sso'
    }

    public async getCookieExpiry(): Promise<number | undefined> {
        const cookie = await this.getSageMakerCookies()
        if (!cookie) {
            return undefined
        }
        const cookieExpiry = cookie.authMode === 'Iam' ? cookie.expiryTime : cookie.ssoExpiryTimestamp
        return Math.min(cookieExpiry ? Number(cookieExpiry) : TOKEN_EXPIRY, TOKEN_EXPIRY)
    }

    public async getSageMakerCookies(forceUpdate = false): Promise<SageMakerCookie | undefined> {
        if (forceUpdate || this.cachedCookies == null) {
            try {
                // const cookiesFilePath = (await vscode.commands.executeCommand('sagemaker.loadCookies')) as string
                const cookiesFilePath = '/home/sagemaker-user/.aws/sso/cookies.json'
                if (cookiesFilePath) {
                    this.cachedCookies = JSON.parse(
                        fs.readFileSync(cookiesFilePath, { encoding: 'utf8' })
                    ) as SageMakerCookie
                }
            } catch {
                this.cachedCookies = undefined
            }
        }
        return this.cachedCookies
    }

    public async getAmazonQProfileArn(): Promise<string | undefined> {
        if (!this.cachedProfileArn) {
            if (!(await this.isSsoUser())) {
                // For IAM users, no need to check for Pro tier.
                return undefined
            }
            const domainId = await this.getDomainId()
            if (!domainId) {
                return undefined
            }
            const domainQSettings = (await this.sageMakerClient.describeDomain({ DomainId: domainId })).DomainSettings
                ?.AmazonQSettings
            this.cachedProfileArn = domainQSettings?.Status === 'ENABLED' ? domainQSettings?.QProfileArn : undefined
        }

        return this.cachedProfileArn
    }

    /**
     * Extracts domainId from cookie redirect URL if it exists.
     */
    public async getDomainId(): Promise<string | undefined> {
        const domainIdMatcher = /^https:\/\/(d-[^.]+)\.studio\./
        const redirectUrl = (await this.getSageMakerCookies())?.redirectURL
        const match = redirectUrl?.match(domainIdMatcher)
        return match ? match[1] : undefined
    }
}
