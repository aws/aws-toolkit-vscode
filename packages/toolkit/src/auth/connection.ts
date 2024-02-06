/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { Credentials } from '@aws-sdk/types'
import { Mutable } from '../shared/utilities/tsUtils'
import { builderIdStartUrl, SsoToken, truncateStartUrl } from './sso/model'
import { SsoClient } from './sso/clients'
import { CredentialsProviderManager } from './providers/credentialsProviderManager'
import { fromString } from './providers/credentials'
import { getLogger } from '../shared/logger/logger'
import { showMessageWithUrl } from '../shared/utilities/messages'
import { onceChanged } from '../shared/utilities/functionUtils'

/** Shows an error message unless it is the same as the last one shown. */
const warnOnce = onceChanged((s: string, url: string) => {
    void showMessageWithUrl(s, url, undefined, 'error')
})

export const scopesCodeCatalyst = ['codecatalyst:read_write']
export const scopesSsoAccountAccess = ['sso:account:access']
/** These are the non-chat scopes for CW. */
export const scopesCodeWhispererCore = ['codewhisperer:completions', 'codewhisperer:analysis']
export const scopesCodeWhispererChat = ['codewhisperer:conversations']
export const scopesFeatureDev = ['codewhisperer:taskassist']
export const scopesGumby = ['codewhisperer:transformations']

export const defaultSsoRegion = 'us-east-1'

type SsoType =
    | 'any' // any type of sso
    | 'idc' // AWS Identity Center
    | 'builderId'

export const isIamConnection = (conn?: Connection): conn is IamConnection => conn?.type === 'iam'
export const isSsoConnection = (conn?: Connection, type: SsoType = 'any'): conn is SsoConnection => {
    if (conn?.type !== 'sso') {
        return false
    }
    // At this point the conn is an SSO conn, but now we must determine the specific type
    switch (type) {
        case 'idc':
            // An Identity Center SSO connection is the Base/Root and doesn't
            // have any unique identifiers, so we must eliminate the other SSO
            // types to determine if this is Identity Center.
            // This condition should grow as more SsoType's get added.
            return !isBuilderIdConnection(conn)
        case 'builderId':
            return conn.startUrl === builderIdStartUrl
        case 'any':
            return true
    }
}
export const isAnySsoConnection = (conn?: Connection): conn is SsoConnection => isSsoConnection(conn, 'any')
export const isIdcSsoConnection = (conn?: Connection): conn is SsoConnection => isSsoConnection(conn, 'idc')
export const isBuilderIdConnection = (conn?: Connection): conn is SsoConnection => isSsoConnection(conn, 'builderId')

export const isValidCodeCatalystConnection = (conn?: Connection): conn is SsoConnection =>
    isSsoConnection(conn) && hasScopes(conn, scopesCodeCatalyst)

export function hasScopes(target: SsoConnection | SsoProfile, scopes: string[]): boolean {
    return scopes?.every(s => target.scopes?.includes(s))
}

export function createBuilderIdProfile(
    scopes = [...scopesSsoAccountAccess]
): SsoProfile & { readonly scopes: string[] } {
    return {
        scopes,
        type: 'sso',
        ssoRegion: defaultSsoRegion,
        startUrl: builderIdStartUrl,
    }
}

export function createSsoProfile(
    startUrl: string,
    region = 'us-east-1',
    scopes = [...scopesSsoAccountAccess]
): SsoProfile & { readonly scopes: string[] } {
    return {
        scopes,
        type: 'sso',
        startUrl,
        ssoRegion: region,
    }
}

export interface SsoConnection extends SsoProfile {
    readonly id: string
    readonly label: string

    /**
     * Retrieves a bearer token, refreshing or re-authenticating as-needed.
     *
     * This should be called for each new API request sent. It is up to the caller to
     * handle cases where the service rejects the token.
     */
    getToken(): Promise<Pick<SsoToken, 'accessToken' | 'expiresAt'>>
}

export interface IamConnection {
    readonly type: 'iam'
    // Currently equivalent to a serialized `CredentialId`
    // This may change in the future after refactoring legacy implementations
    readonly id: string
    readonly label: string
    getCredentials(): Promise<Credentials>
}

export type Connection = IamConnection | SsoConnection

export interface SsoProfile {
    readonly type: 'sso'
    readonly ssoRegion: string
    readonly startUrl: string
    readonly scopes?: string[]
}

interface BaseIamProfile {
    readonly type: 'iam'
    readonly name: string
}

interface UnknownIamProfile extends BaseIamProfile {
    readonly subtype: 'unknown'
}

export interface LinkedIamProfile extends BaseIamProfile {
    readonly subtype: 'linked'
    readonly ssoSession: SsoConnection['id']
    readonly ssoRoleName: string
    readonly ssoAccountId: string
}

export type IamProfile = LinkedIamProfile | UnknownIamProfile

// Placeholder type.
// Would be expanded over time to support
// https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html
export type Profile = IamProfile | SsoProfile

export interface ConnectionManager {
    /**
     * The 'global' connection currently in use by the Toolkit.
     *
     * Connections can still be used even if they are not the active connection.
     */
    readonly activeConnection: Connection | undefined
    readonly onDidChangeActiveConnection: vscode.Event<Connection | undefined>

    /**
     * Changes the current 'active' connection used by the Toolkit.
     */
    useConnection(connection: Pick<Connection, 'id'>): Promise<Connection>
}

export interface ProfileMetadata {
    /**
     * Labels are used for anything UI related when present.
     */
    readonly label?: string

    /**
     * Used to differentiate various edge-cases that are based off state or state transitions:
     * * `unauthenticated` -> try to login
     * * `valid` -> `invalid` -> notify that the credentials are invalid, prompt to login again
     * * `invalid` -> `invalid` -> immediately throw to stop the user from being spammed
     */
    readonly connectionState: 'valid' | 'invalid' | 'unauthenticated' | 'authenticating'
}

// Difference between "Connection" vs. "Profile":
// * Profile - A stateless configuration that describes how to get credentials
// * Connection - A stateful entity that can produce credentials for a specific target
//
// Connections are very similar to credential providers used in existing logic. The distinction
// is that connections are (ideally) identity-orientated whereas credential providers are not.

export type StoredProfile<T extends Profile = Profile> = T & { readonly metadata: ProfileMetadata }

export class ProfileStore {
    public constructor(private readonly memento: vscode.Memento) {}

    public getProfile(id: string): StoredProfile | undefined {
        return this.getData()[id]
    }

    public getProfileOrThrow(id: string): StoredProfile {
        const profile = this.getProfile(id)
        if (profile === undefined) {
            throw new Error(`Profile does not exist: ${id}`)
        }

        return profile
    }

    public listProfiles(): [id: string, profile: StoredProfile][] {
        return Object.entries(this.getData())
    }

    public async addProfile(id: string, profile: SsoProfile): Promise<StoredProfile<SsoProfile>>
    public async addProfile(id: string, profile: IamProfile): Promise<StoredProfile<IamProfile>>
    public async addProfile(id: string, profile: Profile): Promise<StoredProfile> {
        return this.putProfile(id, this.initMetadata(profile))
    }

    public async updateProfile(id: string, profile: Profile): Promise<StoredProfile> {
        const oldProfile = this.getProfileOrThrow(id)
        if (oldProfile.type !== profile.type) {
            throw new Error(`Cannot change profile type from "${oldProfile.type}" to "${profile.type}"`)
        }

        return this.putProfile(id, { ...oldProfile, ...profile })
    }

    public async updateMetadata(id: string, metadata: ProfileMetadata): Promise<StoredProfile> {
        const profile = this.getProfileOrThrow(id)

        return this.putProfile(id, { ...profile, metadata: { ...profile.metadata, ...metadata } })
    }

    public async deleteProfile(id: string): Promise<void> {
        const data = this.getData()
        delete (data as Mutable<typeof data>)[id]

        await this.updateData(data)
    }

    public getCurrentProfileId(): string | undefined {
        return this.memento.get<string>('auth.currentProfileId')
    }

    public async setCurrentProfileId(id: string | undefined): Promise<void> {
        await this.memento.update('auth.currentProfileId', id)
    }

    private getData() {
        return this.memento.get<{ readonly [id: string]: StoredProfile }>('auth.profiles', {})
    }

    private async updateData(state: { readonly [id: string]: StoredProfile | undefined }) {
        await this.memento.update('auth.profiles', state)
    }

    private async putProfile(id: string, profile: StoredProfile) {
        await this.updateData({ ...this.getData(), [id]: profile })

        return profile
    }

    private initMetadata(profile: Profile): StoredProfile {
        return {
            ...profile,
            metadata: {
                connectionState: 'unauthenticated',
            },
        }
    }
}

export async function loadIamProfilesIntoStore(store: ProfileStore, manager: CredentialsProviderManager) {
    const providers = await manager.getCredentialProviderNames()
    for (const [id, profile] of store.listProfiles()) {
        if (profile.type !== 'iam') {
            continue
        }

        if (profile.subtype === 'linked') {
            const source = store.getProfile(profile.ssoSession)
            if (source === undefined || source.type !== 'sso') {
                await store.deleteProfile(id)
                manager.removeProvider(fromString(id))
            }
        } else if (providers[id] === undefined) {
            await store.deleteProfile(id)
        }
    }

    for (const id of Object.keys(providers)) {
        if (store.getProfile(id) === undefined && !id.startsWith('sso:')) {
            await store.addProfile(id, { type: 'iam', subtype: 'unknown', name: providers[id].credentialTypeId })
        }
    }
}

/**
 * Gets credentials profiles constructed from roles ("Permission Sets") discovered from the given
 * SSO ("IAM Identity Center", "IdC") connection.
 */
export async function* loadLinkedProfilesIntoStore(
    store: ProfileStore,
    sourceId: SsoConnection['id'],
    ssoProfile: StoredProfile<SsoProfile>,
    client: SsoClient
) {
    const accounts = new Set<string>()
    const found = new Set<Connection['id']>()

    const stream = client
        .listAccounts()
        .catch(e => {
            getLogger().error('listAccounts() failed: %s', (e as Error).message)
            return []
        })
        .flatten()
        .map(resp => {
            accounts.add(resp.accountId)
            return client.listAccountRoles({ accountId: resp.accountId }).flatten()
        })
        .flatten()

    for await (const info of stream) {
        const name = `${info.roleName}-${info.accountId}`
        const id = `sso:${sourceId}#${name}`
        found.add(id)

        if (store.getProfile(id) !== undefined) {
            continue
        }

        const profile = await store.addProfile(id, {
            name,
            type: 'iam',
            subtype: 'linked',
            ssoSession: sourceId,
            ssoRoleName: info.roleName,
            ssoAccountId: info.accountId,
        })

        yield [id, profile] as const
    }

    /** Does `ssoProfile` have scopes other than "sso:account:access"? */
    const hasScopes = !!ssoProfile.scopes?.some(s => !scopesSsoAccountAccess.includes(s))
    if (!hasScopes && (accounts.size === 0 || found.size === 0)) {
        // SSO user has no OIDC scopes nor IAM roles. Possible causes:
        // - user is not an "Assigned user" in any account in the SSO org
        // - SSO org has no "Permission sets"
        const name = truncateStartUrl(ssoProfile.startUrl)
        if (accounts.size === 0) {
            getLogger().warn('auth: SSO org (%s) returned no accounts', name)
        } else if (found.size === 0) {
            getLogger().warn('auth: SSO org (%s) returned no roles for account: %s', name, Array.from(accounts).join())
        }
        warnOnce(
            `IAM Identity Center (${name}) returned no roles. Ensure the user is assigned to an account with a Permission Set.`,
            'https://docs.aws.amazon.com/singlesignon/latest/userguide/getting-started.html'
        )
    }

    // Clean-up stale references in case the user no longer has access
    for (const [id, profile] of store.listProfiles()) {
        if (
            profile.type === 'iam' &&
            profile.subtype === 'linked' &&
            profile.ssoSession === sourceId &&
            !found.has(id)
        ) {
            await store.deleteProfile(id)
        }
    }
}

// The true connection state can only be known after trying to use the connection
// So it is not exposed on the `Connection` interface
export type StatefulConnection = Connection & { readonly state: ProfileMetadata['connectionState'] }
