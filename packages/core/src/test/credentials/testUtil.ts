/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import { Auth } from '../../auth/auth'
import { CredentialsProviderManager } from '../../auth/providers/credentialsProviderManager'
import { SsoClient } from '../../auth/sso/clients'
import { builderIdStartUrl, SsoToken } from '../../auth/sso/model'
import { DeviceFlowAuthorization, SsoAccessTokenProvider } from '../../auth/sso/ssoAccessTokenProvider'
import { FakeMemento } from '../fakeExtensionContext'
import { captureEvent, EventCapturer } from '../testUtil'
import { stub } from '../utilities/stubber'
import globals from '../../shared/extensionGlobals'
import { fromString } from '../../auth/providers/credentials'
import { mergeAndValidateSections, parseIni } from '../../auth/credentials/sharedCredentials'
import { SharedCredentialsProvider } from '../../auth/providers/sharedCredentialsProvider'
import { Connection, IamConnection, ProfileStore, SsoConnection, SsoProfile } from '../../auth/connection'
import * as sinon from 'sinon'

/** Mock Connection objects for test usage */
export const ssoConnection: SsoConnection = {
    type: 'sso',
    id: '0',
    label: 'sso',
    ssoRegion: 'us-east-1',
    startUrl: 'https://nkomonen.awsapps.com/start',
    getToken: sinon.stub(),
}
export const builderIdConnection: SsoConnection = { ...ssoConnection, startUrl: builderIdStartUrl, label: 'builderId' }
export const iamConnection: IamConnection = { type: 'iam', id: '0', label: 'iam', getCredentials: sinon.stub() }

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

export async function createTestSections(ini: string) {
    const doc = await vscode.workspace.openTextDocument({ content: ini })
    const sections = parseIni(doc.getText(), doc.uri)

    return mergeAndValidateSections(sections).sections
}

export async function createSharedCredentialsProvider(name: string, ini: string) {
    return new SharedCredentialsProvider(name, await createTestSections(ini))
}

function createTestTokenProvider() {
    let token: SsoToken | undefined
    let counter = 0
    const provider = stub(DeviceFlowAuthorization)
    provider.getToken.callsFake(async () => token)
    provider.createToken.callsFake(
        async () => (token = { accessToken: String(++counter), expiresAt: new Date(Date.now() + 1000000) })
    )
    provider.invalidate.callsFake(async () => (token = undefined))

    return provider
}

type TestAuth = Auth & {
    readonly ssoClient: ReturnType<typeof stub<SsoClient>>
    readonly profileStore: ProfileStore
    readonly credentialsManager: CredentialsProviderManager
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
        if (conn.type === 'sso') {
            const provider = tokenProviders.get(conn.id)
            await provider?.invalidate()
        } else {
            globals.loginManager.store.invalidateCredentials(fromString(conn.id))
        }
    }

    const ssoClient = stub(SsoClient, { region: 'not set' })
    ssoClient.logout.resolves()

    const store = new ProfileStore(new FakeMemento())
    const credentialsManager = new CredentialsProviderManager()
    const auth = new Auth(store, credentialsManager, () => ssoClient, getTokenProvider)

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
        ssoClient,
        credentialsManager,
        profileStore: store,
        getTestTokenProvider,
        createInvalidSsoConnection,
        invalidateCachedCredentials,
        updateConnectionEvents: captureEvent(auth.onDidUpdateConnection),
        activeConnectionEvents: captureEvent(auth.onDidChangeActiveConnection),
    })
}
