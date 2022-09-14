/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AccountDetails, Session } from '../credentials/authentication'
import { getRegistrationCache, SsoAccess } from '../credentials/sso/cache'
import { SsoAccessTokenProvider } from '../credentials/sso/ssoAccessTokenProvider'
import { ConnectedCawsClient, createClient, UserDetails } from '../shared/clients/cawsClient'
import { getLogger } from '../shared/logger'
import { ToolkitError, UnknownError } from '../shared/errors'
import { createSecretsCache, KeyedCache, mapCache } from '../shared/utilities/cacheUtils'
import { assertHasProps } from '../shared/utilities/tsUtils'
import { isCloud9 } from '../shared/extensionUtilities'

const CAWS_SONO_PROFILE = {
    startUrl: 'https://d-9067642ac7.awsapps.com/start',
    region: 'us-east-1',
    scopes: ['sso:account:access'],
}

async function verifySession(tokenProvider: () => Promise<string>, id?: string | UserDetails) {
    const client = await createClient()
    await client.setCredentials(tokenProvider, id)

    return client.verifySession()
}

interface UserMetadata extends UserDetails {
    readonly canAutoConnect?: boolean
}

// Secrets stored on the macOS keychain appear as individual entries for each key
// This is fine so long as the user has only a few accounts. Otherwise this should
// store secrets as a map.
export class CawsAuthStorage {
    private static readonly USERS_MEMENTO_KEY = 'caws.users'
    private static readonly SECRETS_KEY = 'caws.authtokens'

    public constructor(private readonly memento: vscode.Memento, private readonly secrets: vscode.SecretStorage) {}

    public getUser(id: string): UserMetadata | undefined {
        return this.listUsers()[id]
    }

    public listUsers(): Record<string, UserMetadata> {
        return this.memento.get<Record<string, UserMetadata>>(CawsAuthStorage.USERS_MEMENTO_KEY, {})
    }

    public async deleteUser(id: string): Promise<void> {
        const userdata = this.memento.get<Record<string, UserMetadata>>(CawsAuthStorage.USERS_MEMENTO_KEY, {})
        delete userdata[id]
        await this.memento.update(CawsAuthStorage.USERS_MEMENTO_KEY, userdata)
        await this.getTokenCache().clear(id)
    }

    public async updateUser(id: string, metadata?: UserMetadata): Promise<void> {
        const userdata = this.memento.get<Record<string, UserMetadata>>(CawsAuthStorage.USERS_MEMENTO_KEY, {})

        try {
            await this.memento.update(CawsAuthStorage.USERS_MEMENTO_KEY, {
                ...userdata,
                [id]: { ...userdata[id], ...metadata },
            })
        } catch (error) {
            const message = UnknownError.cast(error).message
            getLogger().warn(`REMOVED.codes: failed to save user information for: ${id}: ${message}`)
        }
    }

    private getTokenCache(): KeyedCache<SsoAccess> {
        function read(data: string): SsoAccess {
            return JSON.parse(data, (key, value) => {
                if (key === 'expiresAt') {
                    return new Date(value)
                } else {
                    return value
                }
            })
        }

        function write(data: SsoAccess): string {
            return JSON.stringify(data, (key, value) => {
                if (key === 'expiresAt' && value instanceof Date) {
                    return value.toISOString()
                } else if (value !== undefined) {
                    return value
                }
            })
        }

        const logger = (message: string) => getLogger().debug(`SSO token cache (REMOVED.codes): ${message}`)
        const cache = mapCache(createSecretsCache(this.secrets, logger), read, write)
        const getKey = (id: string) => `${CawsAuthStorage.SECRETS_KEY}.${id}`

        return {
            save: (id, data) => cache.save(getKey(id), data),
            load: id => cache.load(getKey(id)),
            clear: id => cache.clear(getKey(id)),
        }
    }

    public getTokenProvider(id?: string): SsoAccessTokenProvider {
        const profile = { ...CAWS_SONO_PROFILE, identifier: id }
        const provider = new SsoAccessTokenProvider(profile, {
            token: this.getTokenCache(),
            registration: getRegistrationCache(),
        })

        return provider
    }

    public async getTokenFromDisk(): Promise<SsoAccess['token'] | undefined> {
        const tokenProvider = new SsoAccessTokenProvider({
            ...CAWS_SONO_PROFILE,
            identifier: 'caws', // MDE has named the 'sso-session' as 'caws' in the `config` file
        })

        const token = await tokenProvider.getToken()
        if (token !== undefined) {
            const person = await verifySession(async () => token.accessToken)
            const accessDetails: SsoAccess = {
                token: { ...token, identity: person.userId },
                region: CAWS_SONO_PROFILE.region,
                startUrl: CAWS_SONO_PROFILE.startUrl,
            }

            await this.updateUser(person.userId, { ...person, canAutoConnect: true })
            await this.getTokenCache().save(person.userId, accessDetails)

            return accessDetails.token
        }
    }

    public async getPat(id: string): Promise<string | undefined> {
        return this.secrets.get(`caws.pat.${id}`)
    }

    public async storePat(id: string, pat: string): Promise<void> {
        await this.secrets.store(`caws.pat.${id}`, pat)
    }
}

export interface CawsAccount extends AccountDetails {
    readonly metadata: UserMetadata
}
export type CawsSession = Session<string, CawsAccount>

export class CawsAuthenticationProvider {
    #session: (CawsSession & { readonly expiresAt: Date }) | undefined

    private readonly _onDidChangeSession = new vscode.EventEmitter<Omit<CawsSession, 'accessDetails'> | undefined>()
    public readonly onDidChangeSession = this._onDidChangeSession.event

    public constructor(protected readonly storage: CawsAuthStorage, private readonly verify = verifySession) {}

    public get activeAccount() {
        return this.#session?.accountDetails
    }

    public listAccounts(): CawsAccount[] {
        return Object.entries(this.storage.listUsers()).map(([id, data]) => ({
            id,
            label: data.displayName,
            metadata: data,
        }))
    }

    /**
     * Runs through a full SSO flow.
     *
     * This should only ever be called through an explicit user action.
     */
    public async createAccount(): Promise<CawsAccount> {
        const tokenProvider = this.storage.getTokenProvider()
        const token = await tokenProvider.createToken(async token => {
            const person = await this.verify(async () => token.accessToken)
            await this.storage.updateUser(person.userId, { ...person, canAutoConnect: true })

            return person.userId
        })

        // XXX: registrations can only be used for refresh grants with the new OIDC token
        getRegistrationCache()
            .clear(CAWS_SONO_PROFILE)
            .then(() => {
                getLogger().debug('REMOVED.codes: cleared client registration to prevent it being re-used')
            })

        assertHasProps(token, 'identity')
        const user = this.storage.getUser(token.identity)

        if (!user) {
            throw new Error(`No user found with identity: ${token.identity}`)
        }

        return {
            id: token.identity,
            label: user.displayName,
            metadata: user,
        }
    }

    public async getSession(): Promise<CawsSession | undefined> {
        if (!this.#session) {
            return
        }

        if (this.#session.expiresAt.getTime() < Date.now()) {
            getLogger().debug(`REMOVED.codes: refreshing expired credentials`)
            const tokenProvider = this.storage.getTokenProvider(this.#session.accountDetails.id)
            const token = await tokenProvider.getToken()

            if (token === undefined) {
                throw new ToolkitError('Credentials are expired and could not be refreshed', {
                    code: 'ExpiredCredentials',
                })
            }

            this.#session = {
                ...this.#session,
                expiresAt: token.expiresAt,
                accessDetails: token.accessToken,
            }
        }

        return this.#session
    }

    public async login(account: Pick<AccountDetails, 'id'>): Promise<CawsSession> {
        const tokenProvider = this.storage.getTokenProvider(account.id)
        const token = await tokenProvider.getToken()

        if (!token) {
            throw new ToolkitError('Account credentials are invalid or expired. Try logging in again.', {
                code: 'MissingCredentials',
            })
        }

        try {
            const stored = this.storage.getUser(account.id)
            // TODO(sijaden): we need to know exactly which errors CAWS returns for bad tokens
            // right now we invalidate on any error, even if it isn't directly related to the token
            const person = await this.verify(async () => token.accessToken, stored ?? account.id)
            const updatedPerson = { ...person, canAutoConnect: true }

            if (!stored || JSON.stringify(stored) !== JSON.stringify(updatedPerson)) {
                await this.storage.updateUser(person.userId, updatedPerson)
            }

            this.#session = {
                id: person.userId,
                expiresAt: token.expiresAt,
                accessDetails: token.accessToken,
                accountDetails: { id: person.userId, label: person.displayName, metadata: updatedPerson },
            }

            this._onDidChangeSession.fire(this.#session)

            return this.#session
        } catch (err) {
            getLogger().debug(`REMOVED.codes: failed to login (will clear existing secrets): ${(err as Error).message}`)
            tokenProvider.invalidate()
            throw err
        }
    }

    public async logout(): Promise<void> {
        if (this.#session) {
            const removed = [this.#session]
            this.#session = undefined

            await this.storage.updateUser(removed[0].id, {
                ...removed[0].accountDetails.metadata,
                canAutoConnect: false,
            })

            this._onDidChangeSession.fire(undefined)
        }
    }

    public async deleteAccount(account: Pick<CawsAccount, 'id'>): Promise<void> {
        await this.storage.deleteUser(account.id)
    }

    // Get rid of this? Not sure where to put PAT code.
    public async getPat(client: ConnectedCawsClient): Promise<string> {
        const stored = await this.storage.getPat(client.identity.id)

        if (stored) {
            return stored
        }

        const resp = await client.createAccessToken({ name: 'aws-toolkits-vscode-token' })
        await this.storage.storePat(client.identity.id, resp.secret)

        return resp.secret
    }

    public async tryLoginFromDisk(): Promise<CawsSession | undefined> {
        const token = await this.storage.getTokenFromDisk().catch(err => {
            getLogger().warn('REMOVED.codes: failed to pull credentials from disk: %O', err)
        })

        if (token?.identity !== undefined) {
            return this.login({ id: token.identity })
        }
    }

    public createCredentialsProvider(): () => Promise<string> {
        return async () => {
            const session = await this.getSession()

            if (session === undefined) {
                throw new ToolkitError('Toolkit is not logged-in', { code: 'NotLoggedIn' })
            }

            return session.accessDetails
        }
    }

    private static instance: CawsAuthenticationProvider

    public static fromContext(ctx: Pick<vscode.ExtensionContext, 'secrets' | 'globalState'>) {
        const secrets = isCloud9() ? new SecretMemento(ctx.globalState) : ctx.secrets

        return (this.instance ??= new this(new CawsAuthStorage(ctx.globalState, secrets)))
    }
}

/**
 * `secrets` API polyfill for C9.
 *
 * For development only. Do NOT use this for anything else.
 */
class SecretMemento implements vscode.SecretStorage {
    private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>()
    public readonly onDidChange = this.onDidChangeEmitter.event

    public constructor(private readonly memento: vscode.Memento) {}

    public async get(key: string): Promise<string | undefined> {
        return this.getSecrets()[key]
    }

    public async store(key: string, value: string): Promise<void> {
        const current = this.getSecrets()
        await this.memento.update('__secrets', { ...current, [key]: value })
        this.onDidChangeEmitter.fire({ key })
    }

    public async delete(key: string): Promise<void> {
        const current = this.getSecrets()
        delete current[key]
        await this.memento.update('__secrets', current)
        this.onDidChangeEmitter.fire({ key })
    }

    private getSecrets(): Record<string, string | undefined> {
        return this.memento.get('__secrets', {})
    }
}
