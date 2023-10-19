/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../shared/extensionGlobals'

import * as vscode from 'vscode'
import { getLogger } from '../shared/logger'
import { cast, Optional } from '../shared/utilities/typeConstructors'
import { Auth } from './auth'
import { once } from '../shared/utilities/functionUtils'
import { isNonNullable } from '../shared/utilities/tsUtils'
import { CancellationError } from '../shared/utilities/timeoutUtils'
import { Connection, SsoConnection, StatefulConnection } from './connection'

let currentConn: Auth['activeConnection']
const auths = new Map<string, SecondaryAuth>()
const multiConnectionListeners = new WeakMap<Auth, vscode.Disposable>()
const registerAuthListener = (auth: Auth) => {
    return auth.onDidChangeActiveConnection(async newConn => {
        // When we change the active connection, there may be
        // secondary auths that were dependent on the previous active connection.
        // To ensure secondary auths still work, when we change to a new active connection,
        // the following will "save" the oldConn with the secondary auths that are using it.
        const oldConn = currentConn
        if (newConn && oldConn?.state === 'valid') {
            const saveableAuths = Array.from(auths.values()).filter(
                a => !a.hasSavedConnection && a.isUsable(oldConn) && !a.isUsable(newConn)
            )
            await Promise.all(saveableAuths.map(a => a.saveConnection(oldConn)))
        }
        currentConn = newConn
    })
}

export function getSecondaryAuth<T extends Connection>(
    auth: Auth,
    toolId: string,
    toolLabel: string,
    isValid: (conn: Connection) => conn is T
): SecondaryAuth<T> {
    const secondary = new SecondaryAuth(toolId, toolLabel, isValid, auth)
    auths.set(toolId, secondary)
    secondary.onDidChangeActiveConnection(() => onDidChangeConnectionsEmitter.fire())

    if (!multiConnectionListeners.has(auth)) {
        multiConnectionListeners.set(auth, registerAuthListener(auth))
    }

    return secondary
}

/**
 * Gets all {@link SecondaryAuth} instances that have saved the connection
 */
export function getDependentAuths(conn: Connection): SecondaryAuth[] {
    return Array.from(auths.values()).filter(auth => auth.hasSavedConnection && auth.activeConnection?.id === conn.id)
}

export function getAllConnectionsInUse(auth: Auth): StatefulConnection[] {
    const connMap = new Map<Connection['id'], StatefulConnection>()
    const toolConns = Array.from(auths.values())
        .filter(a => a.hasSavedConnection)
        .map(a => a.activeConnection)

    for (const conn of [auth.activeConnection, ...toolConns].filter(isNonNullable)) {
        connMap.set(conn.id, { ...conn, state: auth.getConnectionState(conn) ?? 'invalid' })
    }

    return Array.from(connMap.values())
}

const onDidChangeConnectionsEmitter = new vscode.EventEmitter<void>()
export const onDidChangeConnections = onDidChangeConnectionsEmitter.event

/**
 * Enables a tool to bind to a connection independently from the global {@link Auth} service.
 *
 * Not all connections are usable by every tool, so callers of this class must provide a function
 * that can identify usable connections. Toolkit users are notified whenever a loss of functionality
 * would occur after switching connections. Users can then choose to save the usable connection to
 * the tool, allowing the global connection to move freely.
 */
export class SecondaryAuth<T extends Connection = Connection> {
    #activeConnection: Connection | undefined
    #savedConnection: T | undefined

    private readonly key = `${this.toolId}.savedConnectionId`
    readonly #onDidChangeActiveConnection = new vscode.EventEmitter<T | undefined>()
    public readonly onDidChangeActiveConnection = this.#onDidChangeActiveConnection.event

    public constructor(
        public readonly toolId: string,
        public readonly toolLabel: string,
        public readonly isUsable: (conn: Connection) => conn is T,
        private readonly auth: Auth,
        private readonly memento = globals.context.globalState
    ) {
        const handleConnectionChanged = async (conn?: Connection) => {
            if (
                conn === undefined &&
                this.#savedConnection &&
                this.#savedConnection.id === this.#activeConnection?.id
            ) {
                await this.clearSavedConnection()
            } else {
                this.#activeConnection = conn
                this.#onDidChangeActiveConnection.fire(this.activeConnection)
            }
        }

        this.auth.onDidUpdateConnection(conn => {
            if (this.#savedConnection?.id === conn.id) {
                this.#savedConnection = conn as unknown as T
                this.#onDidChangeActiveConnection.fire(this.activeConnection)
            }
        })

        // Register listener and handle connection immediately in case we were instantiated late
        handleConnectionChanged(this.auth.activeConnection)
        this.auth.onDidChangeActiveConnection(handleConnectionChanged)
        this.auth.onDidDeleteConnection(async (deletedConnId: Connection['id']) => {
            if (deletedConnId === this.#savedConnection?.id) {
                // Our saved connection does not exist anymore, delete the reference to it.
                await this.clearSavedConnection()
            }
        })
    }

    public get activeConnection(): T | undefined {
        if (this.#savedConnection) {
            return this.#savedConnection
        }

        if (this.#activeConnection && this.isUsable(this.#activeConnection)) {
            return this.#activeConnection
        }

        return undefined
    }

    public get hasSavedConnection() {
        return this.#savedConnection !== undefined
    }

    public get isConnectionExpired() {
        return !!this.activeConnection && this.auth.getConnectionState(this.activeConnection) === 'invalid'
    }

    public async saveConnection(conn: T) {
        await this.memento.update(this.key, conn.id)
        this.#savedConnection = conn
        this.#onDidChangeActiveConnection.fire(this.activeConnection)
    }

    /**
     * Globally deletes the connection that this secondary auth is using,
     * effectively doing a signout.
     *
     * The deletion automatically propogates to the other users of this
     * connection, assuming they've configured the event listeners.
     */
    public async deleteConnection() {
        if (this.activeConnection) {
            await this.auth.deleteConnection(this.activeConnection)
        }
    }

    /** Stop using the saved connection and fallback to using the active connection, if it is usable. */
    private async clearSavedConnection() {
        await this.memento.update(this.key, undefined)
        this.#savedConnection = undefined
        this.#onDidChangeActiveConnection.fire(this.activeConnection)
    }

    public async useNewConnection(conn: T) {
        if (this.auth.activeConnection !== undefined && !this.isUsable(this.auth.activeConnection)) {
            await this.saveConnection(conn)
        } else {
            await this.auth.useConnection(conn)
        }
    }

    public async addScopes(conn: T & SsoConnection, extraScopes: string[]) {
        const oldScopes = conn.scopes ?? []
        const newScopes = Array.from(new Set([...oldScopes, ...extraScopes]))

        const updateConnectionScopes = (scopes: string[]) => {
            return this.auth.updateConnection(conn, {
                type: 'sso',
                scopes,
                startUrl: conn.startUrl,
                ssoRegion: conn.ssoRegion,
            })
        }

        const updatedConn = await updateConnectionScopes(newScopes)

        try {
            return await this.auth.reauthenticate(updatedConn)
        } catch (e) {
            if (CancellationError.isUserCancelled(e)) {
                // We updated the connection scopes, but the user cancelled reauth.
                // Revert to old connection scopes, otherwise the new scopes persist.
                await updateConnectionScopes(oldScopes)
            }
            throw e
        }
    }

    // Used to lazily restore persisted connections.
    // Kind of clunky. We need an async module loader layer to make things ergonomic.
    public readonly restoreConnection: () => Promise<T | undefined> = once(async () => {
        try {
            await this.auth.tryAutoConnect()
            this.#savedConnection = await this.loadSavedConnection()
            this.#onDidChangeActiveConnection.fire(this.activeConnection)

            return this.#savedConnection
        } catch (err) {
            getLogger().warn(`auth (${this.toolId}): failed to restore connection: %s`, err)
        }
    })

    private async loadSavedConnection() {
        const id = cast(this.memento.get(this.key), Optional(String))
        if (id === undefined) {
            return
        }

        const conn = await this.auth.getConnection({ id })
        if (conn === undefined) {
            getLogger().warn(`auth (${this.toolId}): removing saved connection "${this.key}" as it no longer exists`)
            await this.memento.update(this.key, undefined)
        } else if (!this.isUsable(conn)) {
            getLogger().warn(`auth (${this.toolId}): saved connection "${this.key}" is not valid`)
            await this.memento.update(this.key, undefined)
        } else {
            return conn
        }
    }
}
