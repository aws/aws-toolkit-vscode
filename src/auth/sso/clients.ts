/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../shared/extensionGlobals'

import {
    AccountInfo,
    GetRoleCredentialsRequest,
    ListAccountRolesRequest,
    ListAccountsRequest,
    LogoutRequest,
    RoleInfo,
    SSO,
    SSOServiceException,
} from '@aws-sdk/client-sso'
import {
    AuthorizationPendingException,
    CreateTokenRequest,
    RegisterClientRequest,
    SSOOIDC,
    StartDeviceAuthorizationRequest,
} from '@aws-sdk/client-sso-oidc'
import { AsyncCollection } from '../../shared/utilities/asyncCollection'
import { pageableToCollection } from '../../shared/utilities/collectionUtils'
import { assertHasProps, isNonNullable, RequiredProps, selectFrom } from '../../shared/utilities/tsUtils'
import { getLogger } from '../../shared/logger'
import { SsoAccessTokenProvider } from './ssoAccessTokenProvider'
import { isClientFault } from '../../shared/errors'
import { DevSettings } from '../../shared/settings'
import { Client } from '@aws-sdk/smithy-client'
import { HttpHandlerOptions, SdkError } from '@aws-sdk/types'
import { HttpRequest, HttpResponse } from '@aws-sdk/protocol-http'
import { StandardRetryStrategy, defaultRetryDecider } from '@aws-sdk/middleware-retry'

export class OidcClient {
    public constructor(private readonly client: SSOOIDC, private readonly clock: { Date: typeof Date }) {}

    public async registerClient(request: RegisterClientRequest) {
        const response = await this.client.registerClient(request)
        assertHasProps(response, 'clientId', 'clientSecret', 'clientSecretExpiresAt')

        return {
            scopes: request.scopes,
            clientId: response.clientId,
            clientSecret: response.clientSecret,
            expiresAt: new this.clock.Date(response.clientSecretExpiresAt * 1000),
        }
    }

    public async startDeviceAuthorization(request: StartDeviceAuthorizationRequest) {
        const response = await this.client.startDeviceAuthorization(request)
        assertHasProps(response, 'expiresIn', 'deviceCode', 'userCode', 'verificationUri')

        return {
            ...selectFrom(response, 'deviceCode', 'userCode', 'verificationUri'),
            expiresAt: new this.clock.Date(response.expiresIn * 1000 + this.clock.Date.now()),
            interval: response.interval ? response.interval * 1000 : undefined,
        }
    }

    public async createToken(request: CreateTokenRequest) {
        const response = await this.client.createToken(request as CreateTokenRequest)
        assertHasProps(response, 'accessToken', 'expiresIn')

        return {
            ...selectFrom(response, 'accessToken', 'refreshToken', 'tokenType'),
            expiresAt: new this.clock.Date(response.expiresIn * 1000 + this.clock.Date.now()),
        }
    }

    public static create(region: string) {
        const updatedRetryDecider = (err: SdkError) => {
            // Check the default retry conditions
            if (defaultRetryDecider(err)) {
                return true
            }

            // Custom retry rules
            return err.name === 'InvalidGrantException'
        }
        const client = new SSOOIDC({
            region,
            endpoint: DevSettings.instance.get('endpoints', {})['ssooidc'],
            retryStrategy: new StandardRetryStrategy(
                () => Promise.resolve(3), // Maximum number of retries
                { retryDecider: updatedRetryDecider }
            ),
        })

        addLoggingMiddleware(client)
        return new this(client, globals.clock)
    }
}

type OmittedProps = 'accessToken' | 'nextToken'
type ExtractOverload<T, U> = T extends {
    (...args: infer P1): infer R1
    (...args: infer P2): infer R2
    (...args: infer P3): infer R3
}
    ? (this: U, ...args: P1) => R1
    : never

// Removes all methods that use callbacks instead of promises
type PromisifyClient<T> = {
    [P in keyof T]: T[P] extends (...args: any[]) => any ? ExtractOverload<T[P], PromisifyClient<T>> : T[P]
}

export class SsoClient {
    public get region() {
        const region = this.client.config.region

        return typeof region === 'string' ? (region as string) : undefined
    }

    public constructor(
        private readonly client: PromisifyClient<SSO>,
        private readonly provider: SsoAccessTokenProvider
    ) {}

    public listAccounts(
        request: Omit<ListAccountsRequest, OmittedProps> = {}
    ): AsyncCollection<RequiredProps<AccountInfo, 'accountId'>[]> {
        const requester = (request: Omit<ListAccountsRequest, 'accessToken'>) =>
            this.call(this.client.listAccounts, request)
        const collection = pageableToCollection(requester, request, 'nextToken', 'accountList')

        return collection.filter(isNonNullable).map(accounts => accounts.map(a => (assertHasProps(a, 'accountId'), a)))
    }

    public listAccountRoles(
        request: Omit<ListAccountRolesRequest, OmittedProps>
    ): AsyncCollection<Required<RoleInfo>[]> {
        const requester = (request: Omit<ListAccountRolesRequest, 'accessToken'>) =>
            this.call(this.client.listAccountRoles, request)
        const collection = pageableToCollection(requester, request, 'nextToken', 'roleList')

        return collection
            .filter(isNonNullable)
            .map(roles => roles.map(r => (assertHasProps(r, 'roleName', 'accountId'), r)))
    }

    public async getRoleCredentials(request: Omit<GetRoleCredentialsRequest, OmittedProps>) {
        const response = await this.call(this.client.getRoleCredentials, request)

        assertHasProps(response, 'roleCredentials')
        assertHasProps(response.roleCredentials, 'accessKeyId', 'secretAccessKey')

        const expiration = response.roleCredentials.expiration

        return {
            ...response.roleCredentials,
            expiration: expiration ? new globals.clock.Date(expiration) : undefined,
        }
    }

    public async logout(request: Omit<LogoutRequest, OmittedProps> = {}) {
        await this.call(this.client.logout, request)
    }

    private call<T extends { accessToken: string | undefined }, U>(
        method: (this: typeof this.client, request: T) => Promise<U>,
        request: Omit<T, 'accessToken'>
    ): Promise<U> {
        const requester = async (req: T) => {
            const token = await this.provider.getToken()
            assertHasProps(token, 'accessToken')

            try {
                return await method.call(this.client, { ...req, accessToken: token.accessToken })
            } catch (error) {
                await this.handleError(error)
                throw error
            }
        }

        return requester(request as T)
    }

    private async handleError(error: unknown): Promise<never> {
        if (error instanceof SSOServiceException && isClientFault(error) && error.name !== 'ForbiddenException') {
            getLogger().warn(`credentials (sso): invalidating stored token: ${error.message}`)
            await this.provider.invalidate()
        }

        throw error
    }

    public static create(region: string, provider: SsoAccessTokenProvider) {
        return new this(
            new SSO({
                region,
                endpoint: DevSettings.instance.get('endpoints', {})['sso'],
            }),
            provider
        )
    }
}

function omitIfPresent<T extends Record<string, unknown>>(obj: T, ...keys: string[]): T {
    const objCopy = { ...obj }
    for (const key of keys) {
        if (key in objCopy) {
            ;(objCopy as any)[key] = '[omitted]'
        }
    }
    return objCopy
}

function addLoggingMiddleware(client: Client<HttpHandlerOptions, any, any, any>) {
    client.middlewareStack.add(
        (next, context) => args => {
            if (HttpRequest.isInstance(args.request)) {
                const { hostname, path } = args.request
                const input = omitIfPresent(args.input, 'clientSecret', 'accessToken', 'refreshToken')
                getLogger().debug('API request (%s %s): %O', hostname, path, input)
            }
            return next(args)
        },
        { step: 'finalizeRequest' }
    )

    client.middlewareStack.add(
        (next, context) => async args => {
            if (!HttpRequest.isInstance(args.request)) {
                return next(args)
            }

            const { hostname, path } = args.request
            const result = await next(args).catch(e => {
                if (e instanceof Error && !(e instanceof AuthorizationPendingException)) {
                    const err = { ...e }
                    delete err['stack']
                    getLogger().error('API response (%s %s): %O', hostname, path, err)
                }
                throw e
            })
            if (HttpResponse.isInstance(result.response)) {
                const output = omitIfPresent(result.output, 'clientSecret', 'accessToken', 'refreshToken')
                getLogger().debug('API response (%s %s): %O', hostname, path, output)
            }

            return result
        },
        { step: 'deserialize' }
    )
}
