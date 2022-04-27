/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../shared/extensionGlobals'

import {
    AccountInfo,
    GetRoleCredentialsRequest,
    ListAccountRolesRequest,
    ListAccountsRequest,
    RoleInfo,
    SSO,
    SSOServiceException,
} from '@aws-sdk/client-sso'
import {
    AuthorizationPendingException,
    CreateTokenRequest,
    RegisterClientRequest,
    SlowDownException,
    SSOOIDC,
    StartDeviceAuthorizationRequest,
} from '@aws-sdk/client-sso-oidc'
import { AsyncCollection } from '../../shared/utilities/asyncCollection'
import { pageableToCollection } from '../../shared/utilities/collectionUtils'
import {
    assertHasProps,
    hasStringProps,
    isNonNullable,
    RequiredProps,
    selectFrom,
} from '../../shared/utilities/tsUtils'
import { isThrottlingError, isTransientError } from '@aws-sdk/service-error-classification'
import { getLogger } from '../../shared/logger'
import { SsoAccessTokenProvider } from './ssoAccessTokenProvider'
import { sleep } from '../../shared/utilities/timeoutUtils'

const BACKOFF_DELAY_MS = 5000

// Needed until the SDKs update their types
type TokenRequest = Omit<CreateTokenRequest, 'deviceCode'> & { readonly deviceCode?: string }

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
        assertHasProps(response, 'expiresIn', 'deviceCode', 'verificationUriComplete')

        return {
            ...selectFrom(response, 'deviceCode', 'verificationUriComplete'),
            expiresAt: new this.clock.Date(response.expiresIn * 1000 + this.clock.Date.now()),
            interval: response.interval ? response.interval * 1000 : undefined,
        }
    }

    public async createToken(request: TokenRequest) {
        const response = await this.client.createToken(request as CreateTokenRequest)
        assertHasProps(response, 'accessToken', 'expiresIn')

        const accessToken = response.accessToken.replace(/^aoa/, '')

        return {
            ...selectFrom(response, 'refreshToken', 'tokenType'),
            expiresAt: new this.clock.Date(response.expiresIn * 1000 + this.clock.Date.now()),
            accessToken,
        }
    }

    public async pollForToken(request: CreateTokenRequest, timeout: number, interval = BACKOFF_DELAY_MS) {
        while (this.clock.Date.now() + interval <= timeout) {
            try {
                return await this.createToken(request)
            } catch (err) {
                if (!hasStringProps(err, 'name')) {
                    throw err
                }

                if (err.name === SlowDownException.name) {
                    interval += BACKOFF_DELAY_MS
                } else if (err.name !== AuthorizationPendingException.name) {
                    throw err
                }
            }

            await sleep(interval)
        }

        throw new Error('Timed-out waiting for authentication token')
    }

    public static create(region: string) {
        return new this(new SSOOIDC({ region: region }), globals.clock)
    }
}

type OmittedProps = 'accessToken' | 'nextToken'

export class SsoClient {
    public constructor(private readonly client: SSO) {}

    public listAccounts(
        request: Omit<ListAccountsRequest, OmittedProps> = {}
    ): AsyncCollection<RequiredProps<AccountInfo, 'accountId'>[]> {
        const requester = (request: ListAccountsRequest) => this.client.listAccounts(request)
        const collection = pageableToCollection(requester, this.makeRequest(request), 'nextToken', 'accountList')

        return collection.filter(isNonNullable).map(accounts => accounts.map(a => (assertHasProps(a, 'accountId'), a)))
    }

    public listAccountRoles(
        request: Omit<ListAccountRolesRequest, OmittedProps>
    ): AsyncCollection<Required<RoleInfo>[]> {
        const requester = (request: ListAccountRolesRequest) => this.client.listAccountRoles(request)
        const collection = pageableToCollection(requester, this.makeRequest(request), 'nextToken', 'roleList')

        return collection
            .filter(isNonNullable)
            .map(roles => roles.map(r => (assertHasProps(r, 'roleName', 'accountId'), r)))
    }

    public async getRoleCredentials(request: Omit<GetRoleCredentialsRequest, OmittedProps>) {
        const response = await this.client.getRoleCredentials(this.makeRequest(request))

        assertHasProps(response, 'roleCredentials')
        assertHasProps(response.roleCredentials, 'accessKeyId', 'secretAccessKey')

        const expiration = response.roleCredentials.expiration

        return {
            ...response.roleCredentials,
            expiration: expiration ? new globals.clock.Date(expiration) : undefined,
        }
    }

    private makeRequest<T extends Record<any, any>>(request: T): T & { accessToken: string | undefined } {
        return { ...request, accessToken: undefined }
    }

    // TODO(sijaden): remove this. Only used so we don't need to stub the constructor.
    public static create(region: string, provider: SsoAccessTokenProvider) {
        const client = new SSO({ region })

        return new this(addTokenMiddleware(client, provider))
    }
}

export function addTokenMiddleware(client: SSO, provider: SsoAccessTokenProvider): SSO {
    async function handleError(error: unknown): Promise<never> {
        if (
            error instanceof SSOServiceException &&
            error.$fault === 'client' &&
            !(isThrottlingError(error) || isTransientError(error))
        ) {
            getLogger().warn(`credentials (sso): invalidating stored token: ${error.message}`)
            await provider.invalidate()
        }

        throw error
    }

    client.middlewareStack.add(next => async args => {
        const token = await provider.getToken()
        assertHasProps(token, 'accessToken')
        args.input.accessToken = token.accessToken

        return next(args).catch(handleError)
    })

    return client
}
