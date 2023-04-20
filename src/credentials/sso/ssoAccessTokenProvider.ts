/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import globals from '../../shared/extensionGlobals'
import * as vscode from 'vscode'
import { AuthorizationPendingException, SlowDownException, SSOOIDCServiceException } from '@aws-sdk/client-sso-oidc'
import { openSsoPortalLink, SsoToken, ClientRegistration, isExpired, SsoProfile, builderIdStartUrl } from './model'
import { getCache } from './cache'
import { hasProps, hasStringProps, RequiredProps, selectFrom } from '../../shared/utilities/tsUtils'
import { CancellationError, sleep } from '../../shared/utilities/timeoutUtils'
import { OidcClient } from './clients'
import { loadOr } from '../../shared/utilities/cacheUtils'
import { getRequestId, getTelemetryReason, getTelemetryResult, isClientFault, ToolkitError } from '../../shared/errors'
import { getLogger } from '../../shared/logger'
import { telemetry } from '../../shared/telemetry/telemetry'
import { DevSettings } from '../../shared/settings'
import { getIdeProperties, isCloud9 } from '../../shared/extensionUtilities'

const clientRegistrationType = 'public'
const deviceGrantType = 'urn:ietf:params:oauth:grant-type:device_code'
const refreshGrantType = 'refresh_token'

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
        private readonly profile: Pick<SsoProfile, 'startUrl' | 'region' | 'scopes' | 'identifier'>,
        private readonly cache = getCache(),
        private readonly oidc = OidcClient.create(profile.region)
    ) {}

    public async invalidate(): Promise<void> {
        await Promise.all([
            this.cache.token.clear(this.tokenCacheKey),
            this.cache.registration.clear(this.registrationCacheKey),
        ])
    }

    public async getToken(): Promise<SsoToken | undefined> {
        const data = await this.cache.token.load(this.tokenCacheKey)

        if (!data || !isExpired(data.token)) {
            return data?.token
        }

        if (data.registration && !isExpired(data.registration) && hasProps(data.token, 'refreshToken')) {
            const refreshed = await this.refreshToken(data.token, data.registration)

            return refreshed.token
        } else {
            await this.invalidate()
        }
    }

    public async createToken(identityProvider?: (token: SsoToken) => Promise<string>): Promise<SsoToken> {
        const access = await this.runFlow()
        const identity = (await identityProvider?.(access.token)) ?? this.tokenCacheKey
        await this.cache.token.save(identity, access)
        await setSessionCreationDate(this.tokenCacheKey, new Date())

        return { ...access.token, identity }
    }

    private async runFlow() {
        const cacheKey = this.registrationCacheKey
        const registration = await loadOr(this.cache.registration, cacheKey, () => this.registerClient())

        try {
            return await this.authorize(registration)
        } catch (err) {
            if (err instanceof SSOOIDCServiceException && isClientFault(err)) {
                await this.cache.registration.clear(cacheKey)
            }

            throw err
        }
    }

    private async refreshToken(token: RequiredProps<SsoToken, 'refreshToken'>, registration: ClientRegistration) {
        try {
            const clientInfo = selectFrom(registration, 'clientId', 'clientSecret')
            const response = await this.oidc.createToken({ ...clientInfo, ...token, grantType: refreshGrantType })
            const refreshed = this.formatToken(response, registration)
            await this.cache.token.save(this.tokenCacheKey, refreshed)

            return refreshed
        } catch (err) {
            const span = telemetry.aws_refreshCredentials
            if (DevSettings.instance.get('reportRequestIds', false)) {
                span.record({ requestId: getRequestId(err) } as any)
            }

            span.emit({
                result: getTelemetryResult(err),
                reason: getTelemetryReason(err),
                sessionDuration: getSessionDuration(this.tokenCacheKey),
                credentialType: 'bearerToken',
                credentialSourceId: this.profile.startUrl === builderIdStartUrl ? 'awsId' : 'iamIdentityCenter',
            })

            if (err instanceof SSOOIDCServiceException && isClientFault(err)) {
                await this.cache.token.clear(this.tokenCacheKey)
            }

            throw err
        }
    }

    private formatToken(token: SsoToken, registration: ClientRegistration) {
        return { token, registration, region: this.profile.region, startUrl: this.profile.startUrl }
    }

    protected get tokenCacheKey() {
        return this.profile.identifier ?? this.profile.startUrl
    }

    private get registrationCacheKey() {
        return { region: this.profile.region, scopes: this.profile.scopes }
    }

    private async authorize(registration: ClientRegistration) {
        const authorization = await this.oidc.startDeviceAuthorization({
            startUrl: this.profile.startUrl,
            clientId: registration.clientId,
            clientSecret: registration.clientSecret,
        })

        if (!(await openSsoPortalLink(this.profile.startUrl, authorization))) {
            throw new CancellationError('user')
        }

        const tokenRequest = {
            clientId: registration.clientId,
            clientSecret: registration.clientSecret,
            deviceCode: authorization.deviceCode,
            grantType: deviceGrantType,
        }

        const token = await pollForTokenWithProgress(() => this.oidc.createToken(tokenRequest), authorization)
        return this.formatToken(token, registration)
    }

    private async registerClient(): Promise<ClientRegistration> {
        const companyName = getIdeProperties().company
        return this.oidc.registerClient({
            clientName: isCloud9() ? `${companyName} Cloud9` : `${companyName} Toolkit for VSCode`,
            clientType: clientRegistrationType,
            scopes: this.profile.scopes,
        })
    }

    public static create(profile: Pick<SsoProfile, 'startUrl' | 'region' | 'scopes' | 'identifier'>) {
        return new this(profile)
    }
}

const backoffDelayMs = 5000
async function pollForTokenWithProgress<T>(
    fn: () => Promise<T>,
    authorization: Awaited<ReturnType<OidcClient['startDeviceAuthorization']>>,
    interval = authorization.interval ?? backoffDelayMs
) {
    async function poll(token: vscode.CancellationToken) {
        while (
            authorization.expiresAt.getTime() - globals.clock.Date.now() > interval &&
            !token.isCancellationRequested
        ) {
            try {
                return await fn()
            } catch (err) {
                if (!hasStringProps(err, 'name')) {
                    throw err
                }

                if (err instanceof SlowDownException) {
                    interval += backoffDelayMs
                } else if (!(err instanceof AuthorizationPendingException)) {
                    throw err
                }
            }

            await sleep(interval)
        }

        throw new ToolkitError('Timed-out waiting for browser login flow to complete', {
            code: 'TimedOut',
        })
    }

    return vscode.window.withProgress(
        {
            title: localize(
                'AWS.auth.loginWithBrowser.messageDetail',
                'Login page opened in browser. When prompted, provide this code: {0}',
                authorization.userCode
            ),
            cancellable: true,
            location: vscode.ProgressLocation.Notification,
        },
        (_, token) =>
            Promise.race([
                poll(token),
                new Promise<never>((_, reject) =>
                    token.onCancellationRequested(() => reject(new CancellationError('user')))
                ),
            ])
    )
}

const sessionCreationDateKey = '#sessionCreationDates'
async function setSessionCreationDate(id: string, date: Date, memento = globals.context.globalState) {
    try {
        await memento.update(sessionCreationDateKey, {
            ...memento.get(sessionCreationDateKey),
            [id]: date.getTime(),
        })
    } catch (err) {
        getLogger().verbose('auth: failed to set session creation date: %s', err)
    }
}

function getSessionCreationDate(id: string, memento = globals.context.globalState): number | undefined {
    return memento.get(sessionCreationDateKey, {} as Record<string, number>)[id]
}

function getSessionDuration(id: string, memento = globals.context.globalState) {
    const creationDate = getSessionCreationDate(id, memento)

    return creationDate !== undefined ? Date.now() - creationDate : undefined
}
