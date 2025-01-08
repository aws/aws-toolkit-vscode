/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../shared/extensionGlobals'
import { AuthorizationPendingException, SSOOIDCServiceException, SlowDownException } from '@aws-sdk/client-sso-oidc'
import { SsoToken, ClientRegistration, isExpired, SsoProfile, openSsoPortalLink, isDeprecatedAuth } from './model'
import { getCache } from './cache'
import { hasProps, hasStringProps, RequiredProps, selectFrom } from '../../shared/utilities/tsUtils'
import { OidcClient } from './clients'
import { DiskCacheError, loadOr } from '../../shared/utilities/cacheUtils'
import {
    ToolkitError,
    getErrorMsg,
    getRequestId,
    getTelemetryReason,
    getTelemetryReasonDesc,
    getTelemetryResult,
    isClientFault,
    isNetworkError,
} from '../../shared/errors'
import { getLogger } from '../../shared/logger'
import { AwsLoginWithBrowser, AwsRefreshCredentials, telemetry } from '../../shared/telemetry/telemetry'
import { indent, toBase64URL } from '../../shared/utilities/textUtilities'
import { AuthSSOServer } from './server'
import { CancellationError, sleep } from '../../shared/utilities/timeoutUtils'
import { getIdeProperties, isAmazonQ, isCloud9 } from '../../shared/extensionUtilities'
import { randomBytes, createHash } from 'crypto'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { randomUUID } from '../../shared/crypto'
import { getExtRuntimeContext } from '../../shared/vscode/env'
import { showInputBox } from '../../shared/ui/inputPrompter'
import { AmazonQPromptSettings, DevSettings, PromptSettings, ToolkitPromptSettings } from '../../shared/settings'
import { debounce, onceChanged } from '../../shared/utilities/functionUtils'
import { NestedMap } from '../../shared/utilities/map'
import { asStringifiedStack } from '../../shared/telemetry/spans'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import _ from 'lodash'
import { builderIdStartUrl } from './constants'

export const authenticationPath = 'sso/authenticated'

const clientRegistrationType = 'public'
const deviceGrantType = 'urn:ietf:params:oauth:grant-type:device_code'
const authorizationGrantType = 'authorization_code'
const refreshGrantType = 'refresh_token'

/**
 * See {@link DeviceFlowAuthorization} or {@link AuthFlowAuthorization} for protocol overview.
 */
export abstract class SsoAccessTokenProvider {
    /**
     * Source to pass to aws_loginWithBrowser metric. Due to the complexity of how auth can be called,
     * there is no other easy way to pass this in without signficant refactors.
     */
    private static _authSource: string = 'unknown'
    private static logIfChanged = onceChanged((s: string) => getLogger().info(s))
    private readonly className = 'SsoAccessTokenProvider'

    public static set authSource(val: string) {
        SsoAccessTokenProvider._authSource = val
    }

    public constructor(
        protected readonly profile: Pick<SsoProfile, 'startUrl' | 'region' | 'scopes' | 'identifier'>,
        protected readonly cache = getCache(),
        protected readonly oidc: OidcClient = OidcClient.create(profile.region),
        protected readonly reAuthState: ReAuthState = ReAuthState.instance
    ) {}

    public async invalidate(reason: string): Promise<void> {
        getLogger().info(`SsoAccessTokenProvider: invalidate token and registration`)

        // always emit telemetry when the cache is deleted.
        // most of the time cache is deleted on cache expiration, this is infrequent and expected.
        // Any premature scenarios, that are not explicit deletion by the user, are likely bugs.
        await telemetry.auth_modifyConnection.run(
            async (span) => {
                span.record({
                    source: asStringifiedStack(telemetry.getFunctionStack()),
                    action: 'deleteSsoCache',
                    credentialStartUrl: this.profile.startUrl,
                    sessionDuration: this.getSessionDuration(),
                })

                // Use allSettled() instead of all() to ensure all clear() calls are resolved.
                await Promise.allSettled([
                    this.cache.token.clear(this.tokenCacheKey, 'SsoAccessTokenProvider.invalidate()'),
                    this.cache.registration.clear(this.registrationCacheKey, 'SsoAccessTokenProvider.invalidate()'),
                ])
            },
            { emit: true, functionId: { name: 'invalidate', class: this.className } }
        )

        this.reAuthState.set(this.profile, { reAuthReason: `invalidate():${reason}` })
    }

    /**
     * Sometimes we get many calls at once and this
     * can trigger redundant disk reads, or token refreshes.
     * We debounce to avoid this.
     *
     * NOTE: The property {@link getTokenDebounced()} does not work with being stubbed for tests, so
     * this redundant function was created to work around that.
     */
    public async getToken(): Promise<SsoToken | undefined> {
        return this.getTokenDebounced()
    }
    private getTokenDebounced = debounce(() => this._getToken(), 50)
    /** Exposed for testing purposes only */
    public async _getToken(): Promise<SsoToken | undefined> {
        const data = await this.cache.token.load(this.tokenCacheKey)
        SsoAccessTokenProvider.logIfChanged(
            indent(
                `current client registration id=${data?.registration?.clientId}
             expires at ${data?.registration?.expiresAt}
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
            await this.invalidate('allCacheExpired')
        }
    }

    public async createToken(args?: CreateTokenArgs): Promise<SsoToken> {
        const access = await this.runFlow(args)
        const identity = this.tokenCacheKey
        await this.cache.token.save(identity, access)
        await globals.globalState.setSsoSessionCreationDate(this.tokenCacheKey, new globals.clock.Date())

        return { ...access.token, identity }
    }

    private async runFlow(args?: CreateTokenArgs) {
        const registration = await this.getValidatedClientRegistration()
        args = {
            ...args,
            registrationClientId: registration.clientId,
            registrationExpiresAt: registration.expiresAt.toISOString(),
        }

        try {
            const result = await this.authorize(registration, args)

            // Authentication in the browser is successfully done, so the reauth reason is now stale.
            // We don't clear the reason on failure since we want to keep reporting it as the reason until
            // reauth is a success.
            this.reAuthState.delete(this.profile, 'reauth successful')

            return result
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
        const metric = {
            sessionDuration: getSessionDuration(this.tokenCacheKey),
            credentialType: 'bearerToken',
            credentialSourceId: this.profile.startUrl === builderIdStartUrl ? 'awsId' : 'iamIdentityCenter',
            credentialStartUrl: this.profile.startUrl,
            awsRegion: this.profile.region,
            ssoRegistrationExpiresAt: registration.expiresAt.toISOString(),
            ssoRegistrationClientId: registration.clientId,
        }

        try {
            const clientInfo = selectFrom(registration, 'clientId', 'clientSecret')
            const response = await this.oidc.createToken({ ...clientInfo, ...token, grantType: refreshGrantType })
            const refreshed = this.formatToken(response, registration)
            await this.cache.token.save(this.tokenCacheKey, refreshed)

            telemetry.aws_refreshCredentials.emit({
                result: 'Succeeded',
                requestId: response.requestId,
                ...metric,
            } as AwsRefreshCredentials)

            return refreshed
        } catch (err) {
            if (err instanceof DiskCacheError) {
                /**
                 * Background:
                 * - During token refresh the cache sometimes fails due to a file system error.
                 * - When these errors ocurr it will cause the token refresh process to fail, and the users SSO
                 *   connection to become invalid.
                 * - Because these cache errors do not indicate the SSO session is actually stale,
                 *   we want to catch these errors and not invalidate the users SSO connection since a
                 *   subsequent attempt to refresh may succeed.
                 * - To give the user a chance to resolve their filesystem related issue, we want to point them
                 *   to the logs where the error was logged. Hopefully they can use this information to fix the issue,
                 *   or at least hint for them to provide the logs in a bug report.
                 */
                void DiskCacheErrorMessage.instance.showMessageThrottled(err)
            } else if (!isNetworkError(err)) {
                const reason = getTelemetryReason(err)
                telemetry.aws_refreshCredentials.emit({
                    result: getTelemetryResult(err),
                    reason,
                    reasonDesc: getTelemetryReasonDesc(err),
                    requestId: getRequestId(err),
                    ...metric,
                } as AwsRefreshCredentials)

                if (err instanceof SSOOIDCServiceException && isClientFault(err)) {
                    await this.cache.token.clear(
                        this.tokenCacheKey,
                        `client fault: SSOOIDCServiceException: ${err.message}`
                    )
                    // remember why refresh failed so next reauth flow will know why reauth is needed
                    if (reason) {
                        this.reAuthState.set(this.profile, { reAuthReason: `refresh:${reason}` })
                    }
                }
            }

            throw err
        }
    }

    getSessionDuration() {
        return getSessionDuration(this.tokenCacheKey)
    }

    protected formatToken(token: SsoToken, registration: ClientRegistration) {
        return { token, registration, region: this.profile.region, startUrl: this.profile.startUrl }
    }

    protected get tokenCacheKey() {
        return this.profile.identifier ?? this.profile.startUrl
    }

    protected get registrationCacheKey() {
        return { startUrl: this.profile.startUrl, region: this.profile.region, scopes: this.profile.scopes }
    }

    /**
     * Wraps the given function with telemetry related to the browser login.
     */
    protected withBrowserLoginTelemetry<T extends (...args: any[]) => any>(
        func: T,
        args?: CreateTokenArgs
    ): ReturnType<T> {
        return telemetry.aws_loginWithBrowser.run((span) => {
            span.record({
                credentialStartUrl: this.profile.startUrl,
                source: SsoAccessTokenProvider._authSource,
                isReAuth: args?.isReAuth,
                reAuthReason: args?.isReAuth ? this.reAuthState.get(this.profile).reAuthReason : undefined,
                awsRegion: this.profile.region,
                ssoRegistrationExpiresAt: args?.registrationExpiresAt,
                ssoRegistrationClientId: args?.registrationClientId,
                sessionDuration: getSessionDuration(this.tokenCacheKey),
            })

            // Reset source in case there is a case where browser login was called but we forgot to set the source.
            // We don't want to attribute the wrong source.
            SsoAccessTokenProvider.authSource = 'unknown'

            return func()
        })
    }

    protected abstract authorize(
        registration: ClientRegistration,
        args?: CreateTokenArgs
    ): Promise<{
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
        oidc: OidcClient = OidcClient.create(profile.region),
        reAuthState?: ReAuthState,
        useDeviceFlow: () => boolean = () => {
            /**
             * Device code flow is neccessary when:
             * 1. We are in a workspace connected through ssh (codecatalyst, etc)
             * 2. We are connected to a remote backend through the web browser (code server, openshift dev spaces)
             *
             * Since we are unable to serve the final authorization page
             */
            return getExtRuntimeContext().extensionHost === 'remote'
        }
    ) {
        if (DevSettings.instance.get('webAuth', false) && getExtRuntimeContext().extensionHost === 'webworker') {
            return new WebAuthorization(profile, cache, oidc, reAuthState)
        }
        if (useDeviceFlow()) {
            return new DeviceFlowAuthorization(profile, cache, oidc, reAuthState)
        }
        return new AuthFlowAuthorization(profile, cache, oidc, reAuthState)
    }

    /**
     * Returns a client registration for the current profile if it exists, otherwise
     * undefined.
     */
    public async getClientRegistration() {
        return await this.cache.registration.load(this.registrationCacheKey)
    }
}

/**
 * Supplementary arguments for the create token flow. This data can be used
 * for things like telemetry.
 */
export type CreateTokenArgs = {
    /** true if the create token flow is for reauthentication */
    isReAuth?: boolean

    /** registration info for telemetry */
    registrationClientId?: string
    registrationExpiresAt?: string
}

const backoffDelayMs = 5000
async function pollForTokenWithProgress<T extends { requestId?: string }>(
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
                const res = await fn()
                telemetry.record({
                    requestId: res.requestId,
                })
                return res
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

        // TODO: verify that this emits telemetry
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

/**
 * Gets SSO session creation timestamp for the given session `id`.
 *
 * @param id Session id
 */
function getSessionDuration(id: string) {
    const creationDate = globals.globalState.getSsoSessionCreationDate(id)
    return creationDate !== undefined ? globals.clock.Date.now() - creationDate : undefined
}

/**
 *  SSO "device code" flow (RFC: https://tools.ietf.org/html/rfc8628)
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
export class DeviceFlowAuthorization extends SsoAccessTokenProvider {
    override async registerClient(): Promise<ClientRegistration> {
        const companyName = getIdeProperties().company
        return this.oidc.registerClient(
            {
                clientName: isCloud9() ? `${companyName} Cloud9` : `${companyName} IDE Extensions for VSCode`,
                clientType: clientRegistrationType,
                scopes: this.profile.scopes,
            },
            this.profile.startUrl
        )
    }

    override async authorize(
        registration: ClientRegistration,
        args?: CreateTokenArgs
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

            return await pollForTokenWithProgress(
                () =>
                    this.oidc.createToken({
                        clientId: registration.clientId,
                        clientSecret: registration.clientSecret,
                        deviceCode: authorization.deviceCode,
                        grantType: deviceGrantType,
                    }),
                authorization
            )
        }

        const token = this.withBrowserLoginTelemetry(() => openBrowserAndWaitUntilComplete(), args)

        return this.formatToken(await token, registration)
    }

    /**
     * If the registration already exists locally, it
     * will be validated before being returned. Otherwise, a client registration is
     * created and returned.
     */
    override async getValidatedClientRegistration(): Promise<ClientRegistration> {
        return telemetry.function_call.run(
            async () => {
                const cacheKey = this.registrationCacheKey
                const cachedRegistration = await this.cache.registration.load(cacheKey)

                // Clear cached if registration is expired
                if (cachedRegistration && isExpired(cachedRegistration)) {
                    await this.invalidate('registrationExpired:DeviceCode')
                }

                return loadOr(this.cache.registration, cacheKey, () => this.registerClient())
            },
            { emit: false, functionId: { name: 'getValidatedClientRegistration', class: 'DeviceFlowAuthorization' } }
        )
    }
}

/**
 *  SSO "authorization code" + PKCE flow (https://oauth.net/2/grant-types/authorization-code/)
 *   1. `grant_type = authorization_code`
 *   2. Clients exchange an authorization code for an access token.
 *       1. After the user returns to the client via the redirect URL, the application will get the authorization code from the URL and use it to request an access token.
 *   3. PKCE https://oauth.net/2/pkce/
 *       1. PKCE-enhanced Authorization Code Flow prevents CSRF and authorization code injection attacks, by introducing a *secret* created by the client, that can be verified by the authorization server.
 *       2. PKCE does not add any new responses, so clients can always use the PKCE extension even if an authorization server does not support it.
 *   4. LIFECYCLE
 *       1. CLIENT CREATES AN APP (ONE-TIME)
 *           1. Client creates an "app": server returns a `client_id` for use in all future sessions. (expires in 90 days)
 *       2. PKCE SEQUENCE:
 *           1. Client app generates a random secret (`code_verifier`) per authorization request.
 *           2. Client: AUTHORIZATION REQUEST: `registerClient()`: client sends SHA256 hash (`code_challenge_method`) of the secret (`code_challenge`) in the authorization request.
 *               1. PARAMETERS:
 *                   1. `response_type=code`: indicates that your client expects to receive an authorization code.
 *                   2. `client_id`
 *                   3. `redirect_uri`: Server will navigate the user to this URL, after appending `?code=…`. Typically `http://127.0.0.1/…` but may be remote (`https://vscode.dev/…`) or custom URI scheme (`vscode://…`).
 *                   4. `state=1234zyx`: CSRF token. Random string generated by your (client) application, which you’ll verify later.
 *                   5. `code_challenge`: See above.
 *                   6. `code_challenge_method=S256`: either "plain" or "S256".
 *           3. Server: website redirects the user to `<redirect_uri>?code=…&state=…`.
 *               1. Client verifies the `state` (CSRF token).
 *               2. Client gets the `code`. Can later exchange it for a "token set" (access token, refresh token and id token).
 *           4. Client: ACCESS TOKEN REQUEST ("AUTHORIZATION CODE EXCHANGE"): `createToken()`: client exchanges the authorization code for an access token and sends the un-hashed secret (`code_verifier`), which the server can hash and compare to the original hash, to verify the createToken() request came from the actual client.
 *               1. PARAMETERS:
 *                   1. `grant_type=authorization_code`
 *                   2. `client_id`
 *                   3. `redirect_uri`: See above.
 *                   4. `code`: Authorization code obtained from the redirect.
 *                   5. `client_secret` (optional): The application’s registered client secret if it was issued a secret.
 *                   6. `code_verifier`: See above.
 *           5. Server: transforms the provided `code_verifier` using the same hash method (`code_challenge_method`), then compares it to the stored `code_challenge` string.
 *               1. If the verifier matches the expected value, server issues an access token.
 *               2. If there is a problem, server responds with `invalid_grant` error.
 */
class AuthFlowAuthorization extends SsoAccessTokenProvider {
    override async registerClient(): Promise<ClientRegistration> {
        const companyName = getIdeProperties().company
        return this.oidc.registerClient(
            {
                // All AWS extensions (Q, Toolkit) for a given IDE use the same client name.
                clientName: isCloud9() ? `${companyName} Cloud9` : `${companyName} IDE Extensions for VSCode`,
                clientType: clientRegistrationType,
                scopes: this.profile.scopes,
                grantTypes: [authorizationGrantType, refreshGrantType],
                redirectUris: ['http://127.0.0.1/oauth/callback'],
                issuerUrl: this.profile.startUrl,
            },
            this.profile.startUrl,
            'auth code'
        )
    }

    override async authorize(
        registration: ClientRegistration,
        args?: CreateTokenArgs
    ): Promise<{ token: SsoToken; registration: ClientRegistration; region: string; startUrl: string }> {
        const state = randomUUID()
        const authServer = AuthSSOServer.init(state)

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

                await vscode.env.openExternal(vscode.Uri.parse(location))

                const authorizationCode = await authServer.waitForAuthorization()
                if (authorizationCode.isErr()) {
                    throw authorizationCode.err()
                }

                const res = await this.oidc.createToken({
                    clientId: registration.clientId,
                    clientSecret: registration.clientSecret,
                    grantType: authorizationGrantType,
                    redirectUri,
                    codeVerifier,
                    code: authorizationCode.unwrap(),
                })
                telemetry.record({ requestId: res.requestId })

                return res
            }, args)

            return this.formatToken(token, registration)
        } finally {
            // Temporary delay to make sure the auth ui was displayed to the user before closing
            // inspired by https://github.com/microsoft/vscode/blob/a49c81edea6647684eee87d204e50feed9c455f6/extensions/github-authentication/src/flows.ts#L262
            setTimeout(() => {
                authServer.close().catch((e) => {
                    getLogger().error(
                        'AuthFlowAuthorization: AuthSSOServer.close() failed: %s: %s',
                        (e as Error).name,
                        (e as Error).message
                    )
                })
            }, 5000)
        }
    }

    /**
     * If the registration already exists locally, it
     * will be validated before being returned. Otherwise, a client registration is
     * created and returned.
     */
    override async getValidatedClientRegistration(): Promise<ClientRegistration> {
        return telemetry.function_call.run(
            async () => {
                const cacheKey = this.registrationCacheKey
                const cachedRegistration = await this.cache.registration.load(cacheKey)

                // Clear cached if registration is expired or it uses a deprecate auth version (device code)
                if (cachedRegistration && (isExpired(cachedRegistration) || isDeprecatedAuth(cachedRegistration))) {
                    await this.invalidate('registrationExpired:AuthFlow')
                }

                return loadOr(this.cache.registration, cacheKey, () => this.registerClient())
            },
            { emit: false, functionId: { name: 'getValidatedClientRegistration', class: 'AuthFlowAuthorization' } }
        )
    }
}

/**
 * Alternative to {@link AuthFlowAuthorization} for demo/testing purposes.
 *
 * Allows user to enter the code manually after completing the authorization flow.
 */
class WebAuthorization extends SsoAccessTokenProvider {
    private redirectUri = 'http://127.0.0.1:54321/oauth/callback'

    override async registerClient(): Promise<ClientRegistration> {
        const companyName = getIdeProperties().company
        return this.oidc.registerClient(
            {
                // All AWS extensions (Q, Toolkit) for a given IDE use the same client name.
                clientName: isCloud9() ? `${companyName} Cloud9` : `${companyName} IDE Extensions for VSCode`,
                clientType: clientRegistrationType,
                scopes: this.profile.scopes,
                grantTypes: [authorizationGrantType, refreshGrantType],
                redirectUris: [this.redirectUri],
                issuerUrl: this.profile.startUrl,
            },
            this.profile.startUrl,
            'web auth code'
        )
    }

    override async authorize(
        registration: ClientRegistration,
        args?: CreateTokenArgs
    ): Promise<{ token: SsoToken; registration: ClientRegistration; region: string; startUrl: string }> {
        const state = randomUUID()

        const token = await this.withBrowserLoginTelemetry(async () => {
            const codeVerifier = toBase64URL(randomBytes(32).toString('base64'))
            const codeChallenge = toBase64URL(createHash('sha256').update(codeVerifier).digest().toString('base64'))

            const location = await this.oidc.authorize({
                responseType: 'code',
                clientId: registration.clientId,
                // we aren't running on localhost so we can't see the what ports are free
                redirectUri: this.redirectUri,
                scopes: this.profile.scopes ?? [],
                state,
                codeChallenge,
                codeChallengeMethod: 'S256',
            })

            await vscode.env.openExternal(vscode.Uri.parse(location))

            const inputBox = await showInputBox({
                title: 'Authorization Input',
                placeholder: 'Input the authorization code',
                validateInput: (val: string) => {
                    if (val.length === 0) {
                        return 'At least one character is required'
                    }
                    return undefined
                },
            })

            return this.oidc.createToken({
                clientId: registration.clientId,
                clientSecret: registration.clientSecret,
                grantType: authorizationGrantType,
                redirectUri: this.redirectUri,
                codeVerifier,
                code: inputBox,
            })
        }, args)

        return this.formatToken(token, registration)
    }

    override async getValidatedClientRegistration(): Promise<ClientRegistration> {
        return telemetry.function_call.run(
            async () => {
                const cacheKey = this.registrationCacheKey
                const cachedRegistration = await this.cache.registration.load(cacheKey)

                if (
                    cachedRegistration &&
                    (isExpired(cachedRegistration) || cachedRegistration.flow !== 'web auth code')
                ) {
                    await this.invalidate('registrationExpired:WebAuth')
                }

                return loadOr(this.cache.registration, cacheKey, () => this.registerClient())
            },
            { emit: false, functionId: { name: 'getValidatedClientRegistration', class: 'WebAuthorization' } }
        )
    }
}

/**
 * Remembers the reason an SSO session was put in to a "needs reauthentication" state.
 * The current use is for telemetry. When the user reauths, we want {@link AwsLoginWithBrowser}
 * to know why it needed to be reauthed.
 *
 * The flow is to use `set()` to remember why the user was put in to a reauth state,
 * then upon the next reauth use `get()`. Finally, use `clear()` if the reauth is
 * successful.
 */
export class ReAuthState extends NestedMap<ReAuthStateKey, ReAuthStateValue> {
    static #instance: ReAuthState
    static get instance() {
        return (this.#instance ??= new ReAuthState())
    }
    protected constructor() {
        super()
    }

    protected override hash(profile: ReAuthStateKey): string {
        return profile.identifier ?? profile.startUrl
    }

    protected override get name(): string {
        return ReAuthState.name
    }

    override get default(): ReAuthStateValue {
        return { reAuthReason: undefined }
    }
}

type ReAuthStateKey = Pick<SsoProfile, 'identifier' | 'startUrl'>
type ReAuthStateValue = {
    // the latest reason for why the connection was moved in to a "needs reauth" state
    reAuthReason?: string
}

/**
 * Singleton class that manages showing the user a message during {@link DiskCacheError} errors.
 *
 * Background:
 * - We need this {@link DiskCacheErrorMessage} specifically as a singleton since we want to ensure
 *   that only 1 instance of this message appears at a time. The current implementation creates a new
 *   {@link SsoAccessTokenProvider} instance each time a token is requested, and this can happen multiple
 *   times in rapid succession.
 */
class DiskCacheErrorMessage {
    static #instance: DiskCacheErrorMessage
    static get instance() {
        return (this.#instance ??= new DiskCacheErrorMessage())
    }

    /**
     * Show a `"don't show again"`-able message which tells the user about a file system related error
     * with the sso cache.
     *
     * This message is throttled so we do not spam the user every time something requests a token.
     */
    public showMessageThrottled(error: Error) {
        return this._showMessageThrottled(error)
    }
    private _showMessageThrottled = _.throttle(async (error: Error) => this._showMessage(error), 60_000, {
        leading: true,
    })
    private async _showMessage(error: Error) {
        const dontShow = 'Never warn again'

        const promptSettings: PromptSettings = isAmazonQ()
            ? AmazonQPromptSettings.instance
            : ToolkitPromptSettings.instance

        // We know 'ssoCacheError' is in all extension prompt settings
        if (promptSettings.isPromptEnabled('ssoCacheError')) {
            const result = await showMessage()
            if (result === dontShow) {
                await promptSettings.disablePrompt('ssoCacheError')
            }
        }

        function showMessage() {
            return showViewLogsMessage(
                `Features using SSO will not work due to:\n"${getErrorMsg(error, true)}"`,
                'error',
                [dontShow]
            )
        }
    }
}
