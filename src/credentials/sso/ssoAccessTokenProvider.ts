/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSOOIDC, StartDeviceAuthorizationResponse } from '@aws-sdk/client-sso-oidc'
import { SsoClientRegistration } from './ssoClientRegistration'
import { openSsoPortalLink, SsoAccessToken } from './sso'
import { DiskCache } from './diskCache'
import { getLogger } from '../../shared/logger'
import { sleep } from '../../shared/utilities/promiseUtilities'

const CLIENT_REGISTRATION_TYPE = 'public'
const CLIENT_NAME = 'aws-toolkit-vscode'
// Grant type specified by the 'SSO Login Token Flow' spec.
const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
const MS_PER_SECOND = 1000
const BACKOFF_DELAY_MS = 5000

/**
 *  SSO flow (RFC: https://tools.ietf.org/html/rfc8628)
 *    1. Get a client id (SSO-OIDC identifier, formatted per RFC6749).
 *       - Toolkit code: `registerClient()`
 *       - RETURNS:
 *         - ClientSecret
 *         - ClientId
 *         - ClientSecretExpiresAt
 *       - Client registration is valid for potentially months and creates state
 *         server-side, so the client SHOULD cache them to disk.
 *    2. Start device authorization.
 *       - Toolkit code: `authorizeClient()`
 *       - StartDeviceAuthorization(clientSecret, clientId, startUrl)
 *       - RETURNS (RFC: https://tools.ietf.org/html/rfc8628#section-3.2):
 *         - DeviceCode             : Device verification code
 *         - UserCode               : User verification code
 *         - VerificationUri        : User verification URI on the authorization server
 *         - VerificationUriComplete: User verification URI including the `user_code`
 *         - ExpiresIn              : Lifetime (seconds) of `device_code` and `user_code`
 *         - Interval               : Minimum time (seconds) the client SHOULD wait between polling intervals.
 *    3. Poll for the access token.
 *       - Toolkit code: `pollForToken()`
 *       - Call CreateToken() in a loop.
 *       - RETURNS:
 *         - AccessToken
 *         - ExpiresIn
 */
export class SsoAccessTokenProvider {
    public constructor(
        private ssoRegion: string,
        private ssoUrl: string,
        private ssoOidcClient: SSOOIDC,
        private cache: DiskCache
    ) {}

    public async accessToken(): Promise<SsoAccessToken> {
        const accessToken = this.cache.loadAccessToken(this.ssoUrl)
        if (accessToken) {
            return accessToken
        }
        // SSO step 1
        const registration = await this.registerClient()
        // SSO step 2
        const authorization = await this.authorizeClient(registration)
        // SSO step 3
        const token = await this.pollForToken(registration, authorization)
        this.cache.saveAccessToken(this.ssoUrl, token)
        return token
    }

    public invalidate(): void {
        this.cache.invalidateAccessToken(this.ssoUrl)
    }

    /**
     * SSO step 3: poll for the access token.
     */
    private async pollForToken(
        registration: SsoClientRegistration,
        authz: StartDeviceAuthorizationResponse
    ): Promise<SsoAccessToken> {
        // Device code expiration in milliseconds.
        const deviceCodeExpiration = this.currentTimePlusSecondsInMs(authz.expiresIn!)
        const deviceCodeExpiredMsg = 'SSO: device code expired, login flow must be reinitiated'

        getLogger().info(`SSO: to complete sign-in, visit: ${authz.verificationUriComplete}`)

        /** Retry interval in milliseconds. */
        let retryInterval =
            authz.interval !== undefined && authz.interval! > 0 ? authz.interval! * MS_PER_SECOND : BACKOFF_DELAY_MS

        const createTokenParams = {
            clientId: registration.clientId,
            clientSecret: registration.clientSecret,
            grantType: GRANT_TYPE,
            deviceCode: authz.deviceCode!,
        }

        while (true) {
            try {
                const tokenResponse = await this.ssoOidcClient.createToken(createTokenParams)
                const accessToken: SsoAccessToken = {
                    startUrl: this.ssoUrl,
                    region: this.ssoRegion,
                    accessToken: tokenResponse.accessToken!,
                    expiresAt: new Date(this.currentTimePlusSecondsInMs(tokenResponse.expiresIn!)).toISOString(),
                }
                return accessToken
            } catch (err) {
                const error = err as { name: string }
                if (error.name === 'SlowDownException') {
                    retryInterval += BACKOFF_DELAY_MS
                } else if (error.name === 'AuthorizationPendingException') {
                    // Do nothing, try again after the interval.
                } else if (error.name === 'ExpiredTokenException') {
                    throw Error(deviceCodeExpiredMsg)
                } else if (error.name === 'TimeoutException') {
                    retryInterval *= 2
                } else {
                    throw err
                }
            }
            if (Date.now() + retryInterval > deviceCodeExpiration) {
                throw Error(deviceCodeExpiredMsg)
            }

            await sleep(retryInterval)
        }
    }

    /**
     * SSO step 2: start device authorization.
     */
    public async authorizeClient(registration: SsoClientRegistration): Promise<StartDeviceAuthorizationResponse> {
        const authorizationParams = {
            clientId: registration.clientId,
            clientSecret: registration.clientSecret,
            startUrl: this.ssoUrl,
        }
        try {
            const authorizationResponse = await this.ssoOidcClient.startDeviceAuthorization(authorizationParams)
            const openedPortalLink = await openSsoPortalLink(authorizationResponse)
            if (!openedPortalLink) {
                throw Error(`User has canceled SSO login`)
            }
            return authorizationResponse
        } catch (err) {
            getLogger().error(err as Error) // TODO: remove log? we are rethrowing
            if ((err as { code: string }).code === 'InvalidClientException') {
                this.cache.invalidateClientRegistration(this.ssoRegion)
            }
            throw err
        }
    }

    /**
     * SSO step 1: get a client id.
     */
    public async registerClient(): Promise<SsoClientRegistration> {
        const currentRegistration = this.cache.loadClientRegistration(this.ssoRegion)
        if (currentRegistration) {
            return currentRegistration
        }

        // If ClientRegistration token is expired or does not exist, register ssoOidc client
        const registerParams = {
            clientType: CLIENT_REGISTRATION_TYPE,
            clientName: CLIENT_NAME,
        }
        const registerResponse = await this.ssoOidcClient.registerClient(registerParams)
        const formattedExpiry = new Date(registerResponse.clientSecretExpiresAt! * MS_PER_SECOND).toISOString()

        const registration: SsoClientRegistration = {
            clientId: registerResponse.clientId!,
            clientSecret: registerResponse.clientSecret!,
            expiresAt: formattedExpiry,
        }

        this.cache.saveClientRegistration(this.ssoRegion, registration)

        return registration
    }

    /**
     * Takes the current time and adds the param seconds, returns in milliseconds
     * @param seconds Number of seconds to add
     */
    private currentTimePlusSecondsInMs(seconds: number) {
        return seconds * MS_PER_SECOND + Date.now()
    }
}
