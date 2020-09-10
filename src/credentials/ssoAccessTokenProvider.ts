/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ClientRegistration } from './sso/clientRegistration'
import { AccessToken } from './sso/accessToken'
import { DiskCache } from './sso/diskCache'
import { Authorization } from './sso/authorization'
import { getLogger } from '../shared/logger'

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

        // This next section of the block will be made into its own method
        const signInInstructionMessage = `User Code: ${authorization.userCode}\nVerificationUri: ${authorization.verificationUri}\nVerificationComplete: ${authorization.verificationUriComplete}\n\nUsing a browser, visit: ${authorization.verificationUri}\n\nAnd enter the code: ${authorization.userCode}`
        await vscode.window.showInformationMessage(signInInstructionMessage)

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
                //can't seem to find the list of exceptions from SSOOIDC, just add time for now
                retryInterval += 5
            }

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
}
