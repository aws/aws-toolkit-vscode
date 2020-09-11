/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ClientRegistration } from './clientRegistration'
import { AccessToken } from './accessToken'
import { DiskCache } from './diskCache'
import { Authorization } from './authorization'
import { getLogger } from '../../shared/logger'

const CLIENT_REGISTRATION_TYPE = 'public'
const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

export class SsoAccessTokenProvider {
    private ssoRegion: string
    private ssoUrl: string
    private ssoOidcClient: AWS.SSOOIDC
    private cache: DiskCache

    constructor(ssoRegion: string, ssoUrl: string, ssoOidcClient: AWS.SSOOIDC, cache: DiskCache) {
        this.ssoRegion = ssoRegion
        this.ssoOidcClient = ssoOidcClient
        this.cache = cache
        this.ssoUrl = ssoUrl
    }

    public async accessToken(): Promise<AccessToken> {
        const accessToken = this.cache.loadAccessToken(this.ssoUrl)
        if (accessToken) {
            return accessToken
        }

        try {
            const token = await this.pollForToken()
            this.cache.saveAccessToken(this.ssoUrl, token)
            return token
        } catch (err) {
            throw err
        }
    }

    private async pollForToken(): Promise<AccessToken> {
        const registration = await this.registerClient()
        const authorization = await this.authorizeClient(registration)

        //temporary logging to get URL
        const logger = getLogger()
        logger.info(JSON.stringify(authorization))

        let retryInterval = authorization.interval
        const createTokenParams = {
            clientId: registration.clientId,
            clientSecret: registration.clientSecret,
            grantType: GRANT_TYPE,
            deviceCode: authorization.deviceCode,
        }
        while (true) {
            try {
                const tokenResponse = await this.ssoOidcClient.createToken(createTokenParams).promise()
                const accessToken: AccessToken = {
                    startUrl: this.ssoUrl,
                    region: this.ssoRegion,
                    accessToken: tokenResponse.accessToken!,
                    expiresAt: new Date(Date.now() + tokenResponse.expiresIn! * 1000).toISOString(),
                }
                return accessToken
            } catch (err) {
                if (err.code === 'SlowDownException') {
                    retryInterval += 5
                } else if (err.code === 'AuthorizationPendingException') {
                    //the tool must add the current polling Interval to the current time and check to see if that time is later than the previously calculated expiration time. If not, then the tool will wait for the Interval and then retry the request.
                } else if (err.code === 'ExpiredTokenException') {
                    //MUST raise an exception indicating that the sso login window expired and the ssl login flow must be reinitiated
                }
            }
            retryInterval *= 2
            setInterval(() => {}, retryInterval * 1000)
        }
    }

    private async authorizeClient(registration: ClientRegistration): Promise<Authorization> {
        const authorizationParams = {
            clientId: registration.clientId,
            clientSecret: registration.clientSecret,
            startUrl: this.ssoUrl,
        }
        try {
            const authorizationResponse = await this.ssoOidcClient
                .startDeviceAuthorization(authorizationParams)
                .promise()
            const authorization: Authorization = {
                deviceCode: authorizationResponse.deviceCode!,
                userCode: authorizationResponse.userCode!,
                verificationUri: authorizationResponse.verificationUri!,
                verificationUriComplete: authorizationResponse.verificationUriComplete!,
                expiresIn: authorizationResponse.expiresIn!,
                interval: authorizationResponse.interval!,
            }

            const signInInstructionMessage = `You have chosen an SSO profile that requires authorization. `
            vscode.window.showInformationMessage(signInInstructionMessage)
            vscode.env.openExternal(vscode.Uri.parse(authorization.verificationUriComplete))
            return authorization
        } catch (err) {
            throw err
        }
    }

    private async registerClient(): Promise<ClientRegistration> {
        if (this.cache.loadClientRegistration(this.ssoRegion)) {
            return this.cache.loadClientRegistration(this.ssoRegion)!
        }

        // If ClientRegistration token is expired or does not exist, register ssoOidc client
        const registerParams = {
            clientType: CLIENT_REGISTRATION_TYPE,
            clientName: `aws-toolkit-vscode-${Date.now()}`,
        }
        const registerResponse = await this.ssoOidcClient.registerClient(registerParams).promise()
        const formattedExpiry = new Date(registerResponse.clientSecretExpiresAt!).toISOString()

        const registration: ClientRegistration = {
            clientId: registerResponse.clientId!,
            clientSecret: registerResponse.clientSecret!,
            expiresAt: formattedExpiry,
        }

        this.cache.saveClientRegistration(this.ssoRegion, registration)

        return registration
    }

    public invalidate() {
        this.cache.invalidateAccessToken(this.ssoUrl)
    }
}
