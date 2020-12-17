/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSOOIDC } from 'aws-sdk'
import { SsoClientRegistration } from './ssoClientRegistration'
import { SsoAccessToken } from './ssoAccessToken'
import { DiskCache } from './diskCache'
import { getLogger } from '../../shared/logger'
import { StartDeviceAuthorizationResponse } from 'aws-sdk/clients/ssooidc'
import { openSsoPortalLink } from './ssoSupport'

const CLIENT_REGISTRATION_TYPE = 'public'
const CLIENT_NAME = 'aws-toolkit-vscode'
// According to Spec 'SSO Login Token Flow' the grant type must be the following string
const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
// Used to convert seconds to milliseconds
const MILLISECONDS_PER_SECOND = 1000
const BACKOFF_DELAY_MS = 5000

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
        const registration = await this.registerClient()
        const authorization = await this.authorizeClient(registration)
        const token = await this.pollForToken(registration, authorization)
        this.cache.saveAccessToken(this.ssoUrl, token)
        return token
    }

    public invalidate() {
        this.cache.invalidateAccessToken(this.ssoUrl)
    }

    private async pollForToken(
        registration: SsoClientRegistration,
        authorization: StartDeviceAuthorizationResponse
    ): Promise<SsoAccessToken> {
        // Calculate the device code expiration in milliseconds
        const deviceCodeExpiration = this.currentTimePlusSecondsInMs(authorization.expiresIn!)

        getLogger().info(
            `To complete authentication for this SSO account, please continue to this SSO portal:${authorization.verificationUriComplete}`
        )

        // The retry interval converted to milliseconds
        let retryInterval: number
        if (authorization.interval != undefined && authorization.interval! > 0) {
            retryInterval = authorization.interval! * MILLISECONDS_PER_SECOND
        } else {
            retryInterval = BACKOFF_DELAY_MS
        }

        const createTokenParams = {
            clientId: registration.clientId,
            clientSecret: registration.clientSecret,
            grantType: GRANT_TYPE,
            deviceCode: authorization.deviceCode!,
        }

        while (true) {
            try {
                const tokenResponse = await this.ssoOidcClient.createToken(createTokenParams).promise()
                const accessToken: SsoAccessToken = {
                    startUrl: this.ssoUrl,
                    region: this.ssoRegion,
                    accessToken: tokenResponse.accessToken!,
                    expiresAt: new Date(this.currentTimePlusSecondsInMs(tokenResponse.expiresIn!)).toISOString(),
                }
                return accessToken
            } catch (err) {
                if (err.code === 'SlowDownException') {
                    retryInterval += BACKOFF_DELAY_MS
                } else if (err.code === 'AuthorizationPendingException') {
                    // do nothing, wait the interval and try again
                } else if (err.code === 'ExpiredTokenException') {
                    throw Error(`Device code has expired while polling for SSO token, login flow must be re-initiated.`)
                } else if (err.code === 'TimeoutException') {
                    retryInterval *= 2
                } else {
                    throw err
                }
            }
            if (Date.now() + retryInterval > deviceCodeExpiration) {
                throw Error(`Device code has expired while polling for SSO token, login flow must be re-initiated.`)
            }
            // Delay each attempt by the interval
            await new Promise(resolve => setTimeout(resolve, retryInterval))
        }
    }

    public async authorizeClient(registration: SsoClientRegistration): Promise<StartDeviceAuthorizationResponse> {
        const authorizationParams = {
            clientId: registration.clientId,
            clientSecret: registration.clientSecret,
            startUrl: this.ssoUrl,
        }
        try {
            const authorizationResponse = await this.ssoOidcClient
                .startDeviceAuthorization(authorizationParams)
                .promise()
            const openedPortalLink = await openSsoPortalLink(authorizationResponse)
            if (!openedPortalLink) {
                throw Error(`User has canceled SSO login`)
            }
            return authorizationResponse
        } catch (err) {
            getLogger().error(err)
            if (err.code === 'InvalidClientException') {
                this.cache.invalidateClientRegistration(this.ssoRegion)
            }
            throw err
        }
    }

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
        const registerResponse = await this.ssoOidcClient.registerClient(registerParams).promise()
        const formattedExpiry = new Date(registerResponse.clientSecretExpiresAt!).toISOString()

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
        return seconds * MILLISECONDS_PER_SECOND + Date.now()
    }
}
