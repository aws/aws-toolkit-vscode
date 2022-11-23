/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ConnectedCodeCatalystClient } from '../shared/clients/codecatalystClient'
import { isCloud9 } from '../shared/extensionUtilities'
import { Auth, isBuilderIdConnection, Connection, SsoConnection, codecatalystScopes } from '../credentials/auth'
import { getSecondaryAuth } from '../credentials/secondaryAuth'

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

const isValidCodeCatalystConnection = (conn: Connection): conn is SsoConnection =>
    isBuilderIdConnection(conn) && codecatalystScopes.every(s => conn.scopes?.includes(s))

export class CodeCatalystAuthenticationProvider {
    public readonly onDidChangeActiveConnection = this.secondaryAuth.onDidChangeActiveConnection

    public constructor(
        protected readonly storage: CodeCatalystAuthStorage,
        protected readonly memento: vscode.Memento,
        public readonly auth = Auth.instance,
        public readonly secondaryAuth = getSecondaryAuth('codecatalyst', 'CodeCatalyst', isValidCodeCatalystConnection)
    ) {}

    public get activeConnection() {
        return this.secondaryAuth.activeConnection
    }

    public get isUsingSavedConnection() {
        return this.secondaryAuth.isUsingSavedConnection
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

    public async removeSavedConnection() {
        await this.secondaryAuth.removeConnection()
    }

    public async restore() {
        await this.secondaryAuth.restoreConnection()
    }

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
