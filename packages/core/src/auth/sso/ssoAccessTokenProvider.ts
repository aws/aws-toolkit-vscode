/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../shared/extensionGlobals'
import { AuthorizationPendingException, SSOOIDCServiceException, SlowDownException } from '@aws-sdk/client-sso-oidc'
import {
    SsoToken,
    ClientRegistration,
    isExpired,
    SsoProfile,
    builderIdStartUrl,
    openSsoPortalLink,
    isDeprecatedAuth,
    openSsoUrl,
} from './model'
import { getCache } from './cache'
import { hasProps, hasStringProps, RequiredProps, selectFrom } from '../../shared/utilities/tsUtils'
import { OidcClient, OidcClientV2 } from './clients'
import { loadOr } from '../../shared/utilities/cacheUtils'
import {
    ToolkitError,
    getRequestId,
    getTelemetryReason,
    getTelemetryResult,
    isClientFault,
    isNetworkError,
} from '../../shared/errors'
import { getLogger } from '../../shared/logger'
import { AwsRefreshCredentials, telemetry } from '../../shared/telemetry/telemetry'
import { indent } from '../../shared/utilities/textUtilities'
import { AuthSSOServer } from './server'
import { CancellationError, sleep } from '../../shared/utilities/timeoutUtils'
import OidcClientPKCE from './oidcclientpkce'
import { getIdeProperties, isCloud9 } from '../../shared/extensionUtilities'
import { randomUUID, randomBytes, createHash } from 'crypto'
import { UriHandler } from '../../shared/vscode/uriHandler'
import { DevSettings } from '../../shared/settings'
import { localize } from '../../shared/utilities/vsCodeUtils'

export const authenticationPath = 'sso/authenticated'

const clientRegistrationType = 'public'
const deviceGrantType = 'urn:ietf:params:oauth:grant-type:device_code'
const authorizationGrantType = 'authorization_code'
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
 *          - Calls {@link pollForTokenWithProgress}
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
export abstract class SsoAccessTokenProvider {
    public constructor(
        protected readonly profile: Pick<SsoProfile, 'startUrl' | 'region' | 'scopes' | 'identifier'>,
        protected readonly cache = getCache(),
        protected readonly oidc: OidcClient | OidcClientV2 = OidcClient.create(profile.region)
    ) {}

    public async invalidate(): Promise<void> {
        // Use allSettled() instead of all() to ensure all clear() calls are resolved.
        getLogger().info(`SsoAccessTokenProvider invalidate token and registration`)
        await Promise.allSettled([
            this.cache.token.clear(this.tokenCacheKey, 'SsoAccessTokenProvider.invalidate()'),
            this.cache.registration.clear(this.registrationCacheKey, 'SsoAccessTokenProvider.invalidate()'),
        ])
    }

    public async getToken(): Promise<SsoToken | undefined> {
        const data = await this.cache.token.load(this.tokenCacheKey)
        getLogger().info(
            indent(
                `current client registration id=${data?.registration?.clientId}, 
                            expires at ${data?.registration?.expiresAt}, 
                            key = ${this.tokenCacheKey}`,
                4,
                true
            )
        )
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

    public async createToken(): Promise<SsoToken> {
        const access = await this.runFlow()
        const identity = this.tokenCacheKey
        await this.cache.token.save(identity, access)
        await setSessionCreationDate(this.tokenCacheKey, new Date())

        return { ...access.token, identity }
    }

    private async runFlow() {
        const registration = await this.getValidatedClientRegistration()
        try {
            return await this.authorize(registration)
        } catch (err) {
            if (err instanceof SSOOIDCServiceException && isClientFault(err)) {
                await this.cache.registration.clear(
                    this.registrationCacheKey,
                    `client fault: SSOOIDCServiceException: ${err.message}`
                )
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
            if (!isNetworkError(err)) {
                telemetry.aws_refreshCredentials.emit({
                    result: getTelemetryResult(err),
                    reason: getTelemetryReason(err),
                    requestId: getRequestId(err),
                    sessionDuration: getSessionDuration(this.tokenCacheKey),
                    credentialType: 'bearerToken',
                    credentialSourceId: this.profile.startUrl === builderIdStartUrl ? 'awsId' : 'iamIdentityCenter',
                } as AwsRefreshCredentials)

                if (err instanceof SSOOIDCServiceException && isClientFault(err)) {
                    await this.cache.token.clear(
                        this.tokenCacheKey,
                        `client fault: SSOOIDCServiceException: ${err.message}`
                    )
                }
            }

            throw err
        }
    }

    protected formatToken(token: SsoToken, registration: ClientRegistration) {
        return { token, registration, region: this.profile.region, startUrl: this.profile.startUrl }
    }

    protected get tokenCacheKey() {
        return this.profile.identifier ?? this.profile.startUrl
    }

    protected get registrationCacheKey() {
        return { region: this.profile.region, scopes: this.profile.scopes }
    }

    /**
     * Wraps the given function with telemetry related to the browser login.
     */
    protected withBrowserLoginTelemetry<T extends (...args: any[]) => any>(func: T): ReturnType<T> {
        if (telemetry.spans.some(s => s.name === 'aws_loginWithBrowser')) {
            // During certain flows, eg reauthentication, we are already running within a span (run())
            // so we don't need to create a new one.
            return func()
        }

        return telemetry.aws_loginWithBrowser.run(span => {
            span.record({ credentialStartUrl: this.profile.startUrl })
            return func()
        })
    }

    protected abstract authorize(registration: ClientRegistration): Promise<{
        token: SsoToken
        registration: ClientRegistration
        region: string
        startUrl: string
    }>

    /**
     * If the registration already exists locally, it
     * will be validated before being returned. Otherwise, a client registration is
     * created and returned.
     */
    protected abstract getValidatedClientRegistration(): Promise<ClientRegistration>
    protected abstract registerClient(): Promise<ClientRegistration>

    public static create(
        profile: Pick<SsoProfile, 'startUrl' | 'region' | 'scopes' | 'identifier'>,
        cache = getCache(),
        oidc: OidcClient = OidcClient.create(profile.region)
    ) {
        if (!DevSettings.instance.get('pkceAuth', false)) {
            return new DeviceFlowAuthorization(profile, cache, oidc)
        }
        return new AuthFlowAuthorization(profile, cache, OidcClientV2.create(profile.region))
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
                'Confirm code "{0}" in the login page opened in your web browser.',
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

export class DeviceFlowAuthorization extends SsoAccessTokenProvider {
    constructor(
        profile: Pick<SsoProfile, 'startUrl' | 'region' | 'scopes' | 'identifier'>,
        cache = getCache(),
        oidc: OidcClient = OidcClient.create(profile.region)
    ) {
        super(profile, cache, oidc)
    }

    override async registerClient(): Promise<ClientRegistration> {
        const companyName = getIdeProperties().company
        return this.oidc.registerClient({
            clientName: isCloud9() ? `${companyName} Cloud9` : `${companyName} IDE Extensions for VSCode`,
            clientType: clientRegistrationType,
            scopes: this.profile.scopes,
        })
    }

    override async authorize(
        registration: ClientRegistration
    ): Promise<{ token: SsoToken; registration: ClientRegistration; region: string; startUrl: string }> {
        // This will NOT throw on expired clientId/Secret, but WILL throw on invalid clientId/Secret
        const authorization = await this.oidc.startDeviceAuthorization({
            startUrl: this.profile.startUrl,
            clientId: registration.clientId,
            clientSecret: registration.clientSecret,
        })

        const openBrowserAndWaitUntilComplete = async () => {
            if (!(await openSsoPortalLink(this.profile.startUrl, authorization))) {
                throw new CancellationError('user')
            }

            const tokenRequest = {
                clientId: registration.clientId,
                clientSecret: registration.clientSecret,
                deviceCode: authorization.deviceCode,
                grantType: deviceGrantType,
            }

            return await pollForTokenWithProgress(() => this.oidc.createToken(tokenRequest), authorization)
        }

        const token = this.withBrowserLoginTelemetry(() => openBrowserAndWaitUntilComplete())

        return this.formatToken(await token, registration)
    }

    /**
     * If the registration already exists locally, it
     * will be validated before being returned. Otherwise, a client registration is
     * created and returned.
     */
    override async getValidatedClientRegistration(): Promise<ClientRegistration> {
        const cacheKey = this.registrationCacheKey
        const cachedRegistration = await this.cache.registration.load(cacheKey)

        // Clear cached if registration is expired
        if (cachedRegistration && isExpired(cachedRegistration)) {
            await this.invalidate()
        }

        return loadOr(this.cache.registration, cacheKey, () => this.registerClient())
    }
}

class AuthFlowAuthorization extends SsoAccessTokenProvider {
    constructor(
        profile: Pick<SsoProfile, 'startUrl' | 'region' | 'scopes' | 'identifier'>,
        cache = getCache(),
        protected override readonly oidc: OidcClientV2
    ) {
        super(profile, cache, oidc)
    }

    override async registerClient(): Promise<ClientRegistration> {
        const companyName = getIdeProperties().company
        return this.oidc.registerClient({
            // All AWS extensions (Q, Toolkit) for a given IDE use the same client name.
            clientName: isCloud9() ? `${companyName} Cloud9` : `${companyName} IDE Extensions for VSCode`,
            clientType: clientRegistrationType,
            scopes: this.profile.scopes,
            grantTypes: [authorizationGrantType, refreshGrantType],
            redirectUris: ['http://127.0.0.1/oauth/callback'],
            issuerUrl: this.profile.startUrl,
        })
    }

    override async authorize(
        registration: ClientRegistration
    ): Promise<{ token: SsoToken; registration: ClientRegistration; region: string; startUrl: string }> {
        const state = randomUUID()
        const authServer = new AuthSSOServer(state, UriHandler.buildUri(authenticationPath).toString())

        try {
            await authServer.start()

            const token = await this.withBrowserLoginTelemetry(async () => {
                const redirectUri = authServer.redirectUri

                const codeVerifier = randomBytes(32).toString('base64url')
                const codeChallenge = createHash('sha256').update(codeVerifier).digest().toString('base64url')

                const location = await this.oidc.authorize({
                    responseType: 'code',
                    clientId: registration.clientId,
                    redirectUri: redirectUri,
                    scopes: this.profile.scopes ?? [],
                    state,
                    codeChallenge,
                    codeChallengeMethod: 'S256',
                })

                if (!(await openSsoUrl(vscode.Uri.parse(location)))) {
                    throw new CancellationError('user')
                }

                const authorizationCode = await authServer.waitForAuthorization()
                if (authorizationCode.isErr()) {
                    throw authorizationCode.err()
                }

                const tokenRequest: OidcClientPKCE.CreateTokenRequest = {
                    clientId: registration.clientId,
                    clientSecret: registration.clientSecret,
                    grantType: authorizationGrantType,
                    redirectUri,
                    codeVerifier,
                    code: authorizationCode.unwrap(),
                }

                return this.oidc.createToken(tokenRequest)
            })

            return this.formatToken(token, registration)
        } finally {
            await authServer.close()
        }
    }

    /**
     * If the registration already exists locally, it
     * will be validated before being returned. Otherwise, a client registration is
     * created and returned.
     */
    override async getValidatedClientRegistration(): Promise<ClientRegistration> {
        const cacheKey = this.registrationCacheKey
        const cachedRegistration = await this.cache.registration.load(cacheKey)

        // Clear cached if registration is expired or it uses a deprecate auth version (device code)
        if (cachedRegistration && (isExpired(cachedRegistration) || isDeprecatedAuth(cachedRegistration))) {
            await this.invalidate()
        }

        return loadOr(this.cache.registration, cacheKey, () => this.registerClient())
    }
}
