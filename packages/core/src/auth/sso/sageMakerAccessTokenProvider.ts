/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SsoAccess, SsoCache, getCache } from './cache'
import { SsoProfile, SsoToken, isExpired } from './model'
import { CreateTokenArgs, SsoAccessTokenProvider, SsoTokenProvider, getSessionDuration } from './ssoAccessTokenProvider'
import globals from '../../shared/extensionGlobals'
import { scopesSsoAccountAccess } from '../connection'
import { isAmazonQ } from '../../shared/extensionUtilities'
import { asString } from '../providers/credentials'
import { SageMakerSpaceClient } from '../../shared/sagemaker/client/sagemaker'

export class SageMakerSsoTokenProvider implements SsoTokenProvider {
    private static defaultRegion = 'us-east-1'
    private static tokenCacheKey = asString({ credentialSource: 'sso', credentialTypeId: 'sagemaker' })
    private hasValidSagemakerToken: boolean = false
    private static instance: SageMakerSsoTokenProvider | undefined

    constructor(
        private readonly fallbackProvider: SsoAccessTokenProvider,
        private readonly cache: SsoCache,
        private readonly sageMakerClient: SageMakerSpaceClient = SageMakerSpaceClient.getInstance()
    ) {}

    public static get sagemakerConectionId() {
        return this.tokenCacheKey
    }

    public static getSagemakerProfile() {
        let scopes = [...scopesSsoAccountAccess]
        if (isAmazonQ()) {
            scopes = [...scopes, ...SageMakerSpaceClient.getQConnectionScopes()]
        }

        return {
            scopes,
            startUrl: 'sagemaker',
            identifier: SageMakerSsoTokenProvider.tokenCacheKey,
            region: this.defaultRegion,
        }
    }

    public get ssoTokenProvider() {
        return this.fallbackProvider
    }

    public static create(
        profile: Pick<SsoProfile, 'startUrl' | 'region' | 'scopes' | 'identifier'> & { readonly scopes: string[] },
        cache: SsoCache = getCache()
    ) {
        if (!this.instance) {
            this.instance = new SageMakerSsoTokenProvider(SsoAccessTokenProvider.create(profile), cache)
        }
        return this.instance
    }

    public async invalidate(reason: string): Promise<void> {
        if (this.hasValidSagemakerToken) {
            // No invalidation should happen for sagemaker cookie token as this is not managed by extension.
            return
        }
        await this.fallbackProvider.invalidate(reason)
    }

    public async getToken(): Promise<SsoToken | undefined> {
        const data = await this.cache.token.load(SageMakerSsoTokenProvider.tokenCacheKey)
        if (data && !isExpired(data.token)) {
            return data.token
        }

        const sagemakerCookie = await this.sageMakerClient.getSageMakerCookies(true)
        const cookieExpiry = await this.sageMakerClient.getCookieExpiry()
        if (sagemakerCookie?.AccessToken && sagemakerCookie.redirectURL && cookieExpiry) {
            const access = this.createSageMakerSsoAccess(
                sagemakerCookie.AccessToken,
                sagemakerCookie.redirectURL,
                cookieExpiry
            )
            await this.cache.token.save(SageMakerSsoTokenProvider.tokenCacheKey, access)
            await globals.globalState.setSsoSessionCreationDate(
                SageMakerSsoTokenProvider.tokenCacheKey,
                new globals.clock.Date()
            )
            this.hasValidSagemakerToken = true
            return access.token
        } else {
            this.hasValidSagemakerToken = false
            return await this.fallbackProvider.getToken()
        }
    }

    /**
     * Tokens are not created using this provider. the provider fetches an existing token.
     * This method is used in case the provider failed to get sagemaker cookie token.
     */
    public async createToken(args?: CreateTokenArgs) {
        return await this.fallbackProvider.createToken(args)
    }

    /**
     * Returns a client registration for the current profile if it exists, otherwise
     * undefined.
     * This is used only if the provider failed to read SageMaker Access token. In this case, fallbackProvider is used
     * to register client and perform authentication
     */
    public async getClientRegistration() {
        return await this.fallbackProvider.getClientRegistration()
    }

    public getSessionDuration() {
        return getSessionDuration(SageMakerSsoTokenProvider.tokenCacheKey)
    }

    private createSageMakerSsoAccess(accessToken: string, redirectUrl: string, expiry: number): SsoAccess {
        return {
            token: {
                accessToken: accessToken,
                expiresAt: new Date(globals.clock.Date.now() + expiry),
            },
            region: this.sageMakerClient.getDefaultRegion(),
            startUrl: redirectUrl,
        }
    }
}
