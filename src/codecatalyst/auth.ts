/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ConnectedCodeCatalystClient } from '../shared/clients/codecatalystClient'
import { isCloud9 } from '../shared/extensionUtilities'
import { Auth, Connection, isBuilderIdConnection, SsoConnection } from '../credentials/auth'
import { cast, Optional } from '../shared/utilities/typeConstructors'
import { showQuickPick } from '../shared/ui/pickerPrompter'
import { once } from '../shared/utilities/functionUtils'
import { getCodeCatalystDevEnvId } from '../shared/vscode/env'

// Secrets stored on the macOS keychain appear as individual entries for each key
// This is fine so long as the user has only a few accounts. Otherwise this should
// store secrets as a map.
export class CodeCatalystAuthStorage {
    public constructor(private readonly secrets: vscode.SecretStorage) {}

    public async getPat(id: string): Promise<string | undefined> {
        return this.secrets.get(`codecatalyst.pat.${id}`)
    }

    public async storePat(id: string, pat: string): Promise<void> {
        await this.secrets.store(`codecatalyst.pat.${id}`, pat)
    }
}

const saveConnectionItem = {
    label: 'Yes, use CodeCatalyst with AWS Builder ID while I switch connections.',
    detail: 'This can be removed by selecting "Remove Connection from Tool" on the CodeCatalyst node.',
    data: 'yes',
} as const

const useConnectionItem = {
    label: 'No, switch everything to authenticate with new selection.',
    detail: 'This will not log you out; you can switch back at any point by selecting the profile name.',
    data: 'no',
} as const

const savedConnectionKey = 'aws.codecatalyst.savedConnectionId'

export class CodeCatalystAuthenticationProvider {
    #activeConnection: Connection | undefined
    #savedConnection: SsoConnection | undefined

    private readonly onDidChangeActiveConnectionEmitter = new vscode.EventEmitter<SsoConnection | undefined>()
    public readonly onDidChangeActiveConnection = this.onDidChangeActiveConnectionEmitter.event

    public constructor(
        protected readonly storage: CodeCatalystAuthStorage,
        protected readonly memento: vscode.Memento,
        public readonly auth = Auth.instance
    ) {
        this.restoreSavedConnection()
        this.auth.onDidChangeActiveConnection(async conn => {
            if (conn !== undefined && !isBuilderIdConnection(conn)) {
                if (isBuilderIdConnection(this.#activeConnection)) {
                    const resp = await showQuickPick([saveConnectionItem, useConnectionItem], {
                        title: `Keep using CodeCatalyst with ${conn.label}?`,
                        placeholder: 'Confirm choice',
                    })
                    if (resp === 'yes') {
                        await this.setSavedConnection(this.#activeConnection)
                    }
                }
            } else if (conn === undefined && this.#activeConnection?.id === this.#savedConnection?.id) {
                await this.removeSavedConnection()
            }

            this.#activeConnection = conn
            this.onDidChangeActiveConnectionEmitter.fire(this.activeConnection)
        })
    }

    public get activeConnection() {
        return (
            this.#savedConnection ??
            (isBuilderIdConnection(this.#activeConnection) ? this.#activeConnection : undefined)
        )
    }

    public get isUsingSavedConnection() {
        return this.#savedConnection !== undefined
    }

    // Get rid of this? Not sure where to put PAT code.
    public async getPat(client: ConnectedCodeCatalystClient): Promise<string> {
        const stored = await this.storage.getPat(client.identity.id)

        if (stored) {
            return stored
        }

        const resp = await client.createAccessToken({ name: 'aws-toolkits-vscode-token' })
        await this.storage.storePat(client.identity.id, resp.secret)

        return resp.secret
    }

    public async setSavedConnection(conn: SsoConnection) {
        await this.memento.update(savedConnectionKey, conn.id)
        this.#savedConnection = conn
        this.onDidChangeActiveConnectionEmitter.fire(this.activeConnection)
    }

    public async removeSavedConnection() {
        await this.memento.update(savedConnectionKey, undefined)
        this.#savedConnection = undefined
        this.onDidChangeActiveConnectionEmitter.fire(this.activeConnection)
    }

    public restoreSavedConnection = once(async () => {
        // XXX: don't restore in a dev env
        if (getCodeCatalystDevEnvId() !== undefined) {
            return
        }

        const savedConnection = await getSavedConnection(this.memento, this.auth)
        if (savedConnection !== undefined) {
            this.#savedConnection = savedConnection
            this.onDidChangeActiveConnectionEmitter.fire(this.activeConnection)

            return savedConnection
        }

        return this.#savedConnection
    })

    private static instance: CodeCatalystAuthenticationProvider

    public static fromContext(ctx: Pick<vscode.ExtensionContext, 'secrets' | 'globalState'>) {
        const secrets = isCloud9() ? new SecretMemento(ctx.globalState) : ctx.secrets

        return (this.instance ??= new this(new CodeCatalystAuthStorage(secrets), ctx.globalState))
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

export async function getSavedConnection(memento: vscode.Memento, auth: Auth) {
    const id = cast(memento.get(savedConnectionKey), Optional(String))
    if (id !== undefined) {
        const conn = await auth.getConnection({ id })
        if (conn === undefined) {
            await memento.update(savedConnectionKey, undefined)
            // throw new TypeError('Connection no longer exists')
            return
        }
        if (!isBuilderIdConnection(conn)) {
            await memento.update(savedConnectionKey, undefined)
            throw new TypeError('Connection is not a Builder ID connection')
        }

        return conn
    }
}
