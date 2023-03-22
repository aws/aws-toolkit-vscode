/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Auth, Connection, ProfileStore, SsoConnection, SsoProfile } from '../../credentials/auth'
import { CredentialsProviderManager } from '../../credentials/providers/credentialsProviderManager'
import { SsoClient } from '../../credentials/sso/clients'
import { builderIdStartUrl, SsoToken } from '../../credentials/sso/model'
import { SsoAccessTokenProvider } from '../../credentials/sso/ssoAccessTokenProvider'
import { FakeMemento } from '../fakeExtensionContext'
import { captureEvent, EventCapturer } from '../testUtil'
import { stub } from '../utilities/stubber'

export function createSsoProfile(props?: Partial<Omit<SsoProfile, 'type'>>): SsoProfile {
    return {
        type: 'sso',
        ssoRegion: 'us-east-1',
        startUrl: 'https://d-0123456789.awsapps.com/start',
        ...props,
    }
}

export function createBuilderIdProfile(props?: Partial<Omit<SsoProfile, 'type' | 'startUrl'>>): SsoProfile {
    return createSsoProfile({ startUrl: builderIdStartUrl, ...props })
}

function createTestTokenProvider() {
    let token: SsoToken | undefined
    let counter = 0
    const provider = stub(SsoAccessTokenProvider)
    provider.getToken.callsFake(async () => token)
    provider.createToken.callsFake(
        async () => (token = { accessToken: String(++counter), expiresAt: new Date(Date.now() + 1000000) })
    )
    provider.invalidate.callsFake(async () => (token = undefined))

    return provider
}

type TestAuth = Auth & {
    readonly profileStore: ProfileStore
    readonly updateConnectionEvents: EventCapturer<Connection>
    readonly activeConnectionEvents: EventCapturer<Connection | undefined>
    createInvalidSsoConnection(profile: SsoProfile): Promise<SsoConnection>
    invalidateCachedCredentials(connection: Pick<Connection, 'id'>): Promise<void>
    getTestTokenProvider(connection: Pick<Connection, 'id'>): ReturnType<typeof createTestTokenProvider>
}

export function createTestAuth(): TestAuth {
    const tokenProviders = new Map<string, ReturnType<typeof createTestTokenProvider>>()

    function getTokenProvider(...[profile]: ConstructorParameters<typeof SsoAccessTokenProvider>) {
        const key = profile.identifier ?? profile.startUrl
        const cachedProvider = tokenProviders.get(key)
        if (cachedProvider !== undefined) {
            return cachedProvider
        }

        const provider = createTestTokenProvider()
        tokenProviders.set(key, provider)

        return provider
    }

    async function invalidateCachedCredentials(conn: Connection) {
        const provider = tokenProviders.get(conn.id)
        await provider?.invalidate()
    }

    function createSsoClient() {
        const client = stub(SsoClient)
        client.logout.resolves()

        return client
    }

    const store = new ProfileStore(new FakeMemento())
    const auth = new Auth(store, new CredentialsProviderManager(), createSsoClient, getTokenProvider)

    function getTestTokenProvider(conn: Pick<Connection, 'id'>) {
        const provider = tokenProviders.get(conn.id)
        assert.ok(provider, `No token provider was created for connection: ${conn.id}`)

        return provider
    }

    async function createInvalidSsoConnection(profile: SsoProfile) {
        const conn = await auth.createConnection(profile)
        await invalidateCachedCredentials(conn)

        return conn
    }

    return Object.assign(auth, {
        profileStore: store,
        getTestTokenProvider,
        createInvalidSsoConnection,
        invalidateCachedCredentials,
        updateConnectionEvents: captureEvent(auth.onDidUpdateConnection),
        activeConnectionEvents: captureEvent(auth.onDidChangeActiveConnection),
    })
}
