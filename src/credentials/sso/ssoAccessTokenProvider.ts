/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../shared/extensionGlobals'

import { SSOOIDCServiceException } from '@aws-sdk/client-sso-oidc'
import { openSsoPortalLink, SsoToken, ClientRegistration, isExpired, SsoProfile } from './model'
import { getRegistrationCache, getTokenCache } from './cache'
import { hasProps } from '../../shared/utilities/tsUtils'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { OidcClient } from './clients'
import { loadOr } from '../../shared/utilities/cacheUtils'
import { isThrottlingError, isTransientError } from '@aws-sdk/service-error-classification'

const CLIENT_REGISTRATION_TYPE = 'public'
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
const REFRESH_GRANT_TYPE = 'refresh_token'

/**
 *  SSO flow (RFC: https://tools.ietf.org/html/rfc8628)
 *    1. Get a client id (SSO-OIDC identifier, formatted per RFC6749).
 *       - Toolkit code: {@link SsoAccessTokenProvider.registerClient}
 *          - Calls {@link OidcClient.registerClient}
 *       - RETURNS:
 *         - ClientSecret
 *         - ClientId
 *         - ClientSecretExpiresAt
 *       - Client registration is valid for potentially months and creates state
 *         server-side, so the client SHOULD cache them to disk.
 *    2. Start device authorization.
 *       - Toolkit code: {@link SsoAccessTokenProvider.authorize}
 *          - Calls {@link OidcClient.startDeviceAuthorization}
 *       - RETURNS (RFC: https://tools.ietf.org/html/rfc8628#section-3.2):
 *         - DeviceCode             : Device verification code
 *         - UserCode               : User verification code
 *         - VerificationUri        : User verification URI on the authorization server
 *         - VerificationUriComplete: User verification URI including the `user_code`
 *         - ExpiresIn              : Lifetime (seconds) of `device_code` and `user_code`
 *         - Interval               : Minimum time (seconds) the client SHOULD wait between polling intervals.
 *    3. Poll for the access token.
 *       - Toolkit code: {@link SsoAccessTokenProvider.authorize}
 *          - Calls {@link OidcClient.pollForToken}
 *       - RETURNS:
 *         - AccessToken
 *         - ExpiresIn
 *         - RefreshToken (optional)
 *    4. (Repeat) Tokens SHOULD be refreshed if expired and a refresh token is available.
 *        - Toolkit code: {@link SsoAccessTokenProvider.refreshToken}
 *          - Calls {@link OidcClient.createToken}
 *        - RETURNS:
 *         - AccessToken
 *         - ExpiresIn
 *         - RefreshToken (optional)
 */
export class SsoAccessTokenProvider {
    public constructor(
        private readonly profile: Pick<SsoProfile, 'startUrl' | 'region' | 'scopes'>,
        private readonly oidc = OidcClient.create(profile.region)
    ) {}

    public async invalidate(): Promise<void> {
        await getTokenCache().clear(this.profile.startUrl)
    }

    public async getToken(): Promise<SsoToken | undefined> {
        const tokenCache = getTokenCache()
        const data = await tokenCache.load(this.profile.startUrl)

        if (!data || !isExpired(data.token)) {
            return data?.token
        }

        await this.invalidate()

        if (data.registration) {
            const refreshed = await this.refreshToken(data.token, data.registration)

            if (refreshed) {
                await tokenCache.save(this.profile.startUrl, refreshed)
            }

            return refreshed?.token
        }
    }

    public async createToken(): Promise<SsoToken> {
        const tokenCache = getTokenCache()
        const access = await this.runFlow()
        await tokenCache.save(this.profile.startUrl, access)

        return access.token
    }

    public async getOrCreateToken(): Promise<SsoToken> {
        return (await this.getToken()) ?? (await this.createToken())
    }

    private async runFlow() {
        const cacheKey = this.registrationCacheKey()
        const registrationCache = getRegistrationCache()
        const registration = await loadOr(registrationCache, cacheKey, () => this.registerClient())

        try {
            return await this.authorize(registration)
        } catch (error) {
            if (
                error instanceof SSOOIDCServiceException &&
                error.$fault === 'client' &&
                !(isThrottlingError(error) || isTransientError(error))
            ) {
                registrationCache.clear(cacheKey)
            }

            throw error
        }
    }

    private async refreshToken(token: SsoToken, registration: ClientRegistration) {
        if (hasProps(token, 'refreshToken')) {
            const response = await this.oidc.createToken({ ...registration, ...token, grantType: REFRESH_GRANT_TYPE })

            return this.formatToken(response, registration)
        }
    }

    private formatToken(token: SsoToken, registration: ClientRegistration) {
        return { token, registration, region: this.profile.region, startUrl: this.profile.startUrl }
    }

    private registrationCacheKey() {
        return { region: this.profile.region, scopes: this.profile.scopes }
    }

    private async authorize(registration: ClientRegistration) {
        const authorization = await this.oidc.startDeviceAuthorization({
            startUrl: this.profile.startUrl,
            clientId: registration.clientId,
            clientSecret: registration.clientSecret,
        })

        if (!(await openSsoPortalLink(authorization))) {
            throw new CancellationError('user')
        }

        const tokenRequest = {
            clientId: registration.clientId,
            clientSecret: registration.clientSecret,
            deviceCode: authorization.deviceCode,
            grantType: DEVICE_GRANT_TYPE,
        }

        const token = await this.oidc.pollForToken(
            tokenRequest,
            registration.expiresAt.getTime(),
            authorization.interval
        )

        return this.formatToken(token, registration)
    }

    private async registerClient(): Promise<ClientRegistration> {
        return this.oidc.registerClient({
            clientName: `aws-toolkit-vscode-${globals.clock.Date.now()}`,
            clientType: CLIENT_REGISTRATION_TYPE,
            scopes: this.profile.scopes,
        })
    }

    public static create(profile: Pick<SsoProfile, 'startUrl' | 'region' | 'scopes'>) {
        return new this(profile)
    }
}
