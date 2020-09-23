/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SSOOIDC } from 'aws-sdk'
import { SsoClientRegistration } from './ssoClientRegistration'
import { SsoAccessToken } from './ssoAccessToken'
import { DiskCache } from './diskCache'
import { getLogger } from '../../shared/logger'
import { StartDeviceAuthorizationResponse } from 'aws-sdk/clients/ssooidc'

const CLIENT_REGISTRATION_TYPE = 'public'
const CLIENT_NAME = `aws-toolkit-vscode`
// According to Spec 'SSO Login Token Flow' the grant type must be the following string
const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
// Used to convert seconds to milliseconds
const MILLISECONDS_PER_SECOND = 1000
const BACKOFF_DELAY_MINUTES = 5000

export class SsoAccessTokenProvider {
    private ssoRegion: string
    private ssoUrl: string
    private ssoOidcClient: SSOOIDC
    private cache: DiskCache

    constructor(ssoRegion: string, ssoUrl: string, ssoOidcClient: SSOOIDC, cache: DiskCache) {
        this.ssoRegion = ssoRegion
        this.ssoOidcClient = ssoOidcClient
        this.cache = cache
        this.ssoUrl = ssoUrl
    }

    public async accessToken(): Promise<SsoAccessToken> {
        const accessToken = this.cache.loadAccessToken(this.ssoUrl)
        if (accessToken) {
            return accessToken
        }
        try {
            const registration = await this.registerClient()
            const authorization = await this.authorizeClient(registration)
            const token = await this.pollForToken(registration, authorization)
            this.cache.saveAccessToken(this.ssoUrl, token)
            return token
        } catch (error) {
            getLogger().error(error)
            throw error
        }
    }

    public invalidate() {
        this.cache.invalidateAccessToken(this.ssoUrl)
    }

    private async pollForToken(
        registration: SsoClientRegistration,
        authorization: StartDeviceAuthorizationResponse
    ): Promise<SsoAccessToken> {
        // Calculate the device code expirtation in milliseconds
        const deviceCodeExpiration = this.currentTimePlusSecondsInMs(authorization.expiresIn!)

        getLogger().info(
            `To complete authentication for this SSO account, please continue to this SSO portal:${authorization.verificationUriComplete}`
        )

        // The retry interval converted to milliseconds
        let retryInterval: number
        if (authorization.interval != undefined && authorization.interval! > 0) {
            retryInterval = authorization.interval! * MILLISECONDS_PER_SECOND
        } else {
            retryInterval = BACKOFF_DELAY_MINUTES
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
                    retryInterval += BACKOFF_DELAY_MINUTES
                } else if (err.code === 'AuthorizationPendingException') {
                    // do nothing, wait the interval and try again
                } else if (err.code === 'ExpiredTokenException') {
                    getLogger().error(err)
                    throw Error(`Device code has expired while polling for SSO token, login flow must be re-initiated.`)
                } else if (err.code === 'TimeoutException') {
                    retryInterval *= 2
                } else {
                    getLogger().error(err)
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

    private async authorizeClient(registration: SsoClientRegistration): Promise<StartDeviceAuthorizationResponse> {
        const authorizationParams = {
            clientId: registration.clientId,
            clientSecret: registration.clientSecret,
            startUrl: this.ssoUrl,
        }
        try {
            const authorizationResponse = await this.ssoOidcClient
                .startDeviceAuthorization(authorizationParams)
                .promise()

            const signInInstructionMessage = `You have chosen an AWS Single Sign-On profile that requires authorization. `
            vscode.window.showInformationMessage(signInInstructionMessage, { modal: true })
            vscode.env.openExternal(vscode.Uri.parse(authorizationResponse.verificationUriComplete!))
            return authorizationResponse
        } catch (err) {
            getLogger().error(err)
            throw err
        }
    }

    private async registerClient(): Promise<SsoClientRegistration> {
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
     * Takes a number of seconds and returns the number of milliseconds elapsed since January 1, 1970 00:00:00 UTC plus the passed seconds.
     */
    private currentTimePlusSecondsInMs(seconds: number) {
        return seconds * MILLISECONDS_PER_SECOND + Date.now()
    }
}
