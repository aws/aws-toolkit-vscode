/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../shared/logger/logger'
import { cast, Optional } from '../shared/utilities/typeConstructors'
import { Auth } from './auth'
import { onceChanged } from '../shared/utilities/functionUtils'
import { isNonNullable } from '../shared/utilities/tsUtils'
import { ToolIdStateKey } from '../shared/globalState'
import { Connection, getTelemetryMetadataForConn, SsoConnection, StatefulConnection } from './connection'
import { indent } from '../shared/utilities/textUtilities'
import { AuthModifyConnection, AuthStatus, Span, telemetry } from '../shared/telemetry/telemetry'
import { asStringifiedStack } from '../shared/telemetry/spans'
import { withTelemetryContext } from '../shared/telemetry/util'
import { isNetworkError } from '../shared/errors'
import globals from '../shared/extensionGlobals'

export type ToolId = 'codecatalyst' | 'codewhisperer' | 'testId'

let currentConn: Auth['activeConnection']
const auths = new Map<string, SecondaryAuth>()
const multiConnectionListeners = new WeakMap<Auth, vscode.Disposable>()
const registerAuthListener = (auth: Auth) => {
    return auth.onDidChangeActiveConnection(async (newConn) => {
        // When we change the active connection, there may be
        // secondary auths that were dependent on the previous active connection.
        // To ensure secondary auths still work, when we change to a new active connection,
        // the following will "save" the oldConn with the secondary auths that are using it.
        const oldConn = currentConn
        if (newConn && oldConn?.state === 'valid') {
            const saveableAuths = Array.from(auths.values()).filter(
                (a) => !a.hasSavedConnection && a.isUsable(oldConn) && !a.isUsable(newConn)
            )
            await Promise.all(saveableAuths.map((a) => a.saveConnection(oldConn)))
        }
        currentConn = newConn
    })
}

export function getSecondaryAuth<T extends Connection>(
    auth: Auth,
    toolId: ToolId,
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
    return Array.from(auths.values()).filter((auth) => auth.hasSavedConnection && auth.activeConnection?.id === conn.id)
}

export function getAllConnectionsInUse(auth: Auth): StatefulConnection[] {
    const connMap = new Map<Connection['id'], StatefulConnection>()
    const toolConns = Array.from(auths.values())
        .filter((a) => a.hasSavedConnection)
        .map((a) => a.activeConnection)

    for (const conn of [auth.activeConnection, ...toolConns].filter(isNonNullable)) {
        connMap.set(conn.id, { ...conn, state: auth.getConnectionState(conn) ?? 'invalid' })
    }

    return Array.from(connMap.values())
}

const onDidChangeConnectionsEmitter = new vscode.EventEmitter<void>()
export const onDidChangeConnections = onDidChangeConnectionsEmitter.event

// Variable must be declared outside of class to work with decorators
const secondaryAuthClassName = 'SecondaryAuth'
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
    protected static readonly logIfChanged = onceChanged((s: string) => getLogger().info(s))

    private readonly key: ToolIdStateKey = `${this.toolId}.savedConnectionId`
    readonly #onDidChangeActiveConnection = new vscode.EventEmitter<T | undefined>()
    public readonly onDidChangeActiveConnection = this.#onDidChangeActiveConnection.event

    public constructor(
        public readonly toolId: ToolId,
        public readonly toolLabel: string,
        public readonly isUsable: (conn: Connection) => conn is T,
        private readonly auth: Auth
    ) {
        const handleConnectionChanged = async (newActiveConn?: Connection) => {
            if (newActiveConn === undefined && this.#activeConnection?.id) {
                // The active connection was removed
                await this.clearActiveConnection()
            }

            const previousActiveId = this.activeConnection?.id
            this.#activeConnection = newActiveConn
            if (this.activeConnection?.id !== previousActiveId) {
                // The user will get a different active connection from before, so notify them.
                this.#onDidChangeActiveConnection.fire(this.activeConnection)
            }
        }

        this.auth.onDidUpdateConnection((conn) => {
            if (this.#savedConnection?.id === conn.id) {
                this.#savedConnection = conn as unknown as T
                this.#onDidChangeActiveConnection.fire(this.activeConnection)
            }
        })

        this.auth.onDidChangeConnectionState((e) => {
            if (this.activeConnection?.id === e.id) {
                this.#onDidChangeActiveConnection.fire(this.activeConnection)
            }
        })

        // Register listener and handle connection immediately in case we were instantiated late
        handleConnectionChanged(this.auth.activeConnection).catch((e) => {
            getLogger().error('handleConnectionChanged() failed: %s', (e as Error).message)
        })
        this.auth.onDidChangeActiveConnection(handleConnectionChanged)
        this.auth.onDidDeleteConnection(async (event) => {
            if (event.connId === this.#activeConnection?.id) {
                await this.clearActiveConnection()
            }
            if (event.connId === this.#savedConnection?.id) {
                // Our saved connection does not exist anymore, delete the reference to it.
                await this.clearSavedConnection()
            }
        })

        const refreshConn = (event: string) => {
            getLogger().debug(`secondaryAuth: detected ${event} event in sso cache, refreshing auth.`)
            globals.clock.setTimeout(
                telemetry.function_call.run(
                    () => async () => {
                        if (this.#savedConnection?.id === this.getStateConnectionId()) {
                            // Someone updated our cache but the global state doesn't indicate anything new, so do nothing.
                            // (it could have been us that updated the cache)
                            getLogger().debug(
                                `secondaryAuth: cache event did not update global state, no refresh is needed.`
                            )
                            return
                        }
                        await this.auth.restorePreviousSession()
                        await this.restoreConnection(true)
                    },
                    {
                        emit: false,
                        functionId: { name: 'cacheWatchCallback', class: secondaryAuthClassName },
                    }
                ),
                /**
                 * The connection is first created and stored on disk, then it is stored in global state.
                 * This creates a race condition for the callback, who listens to the disk event but
                 * depends on the global state to make a connection decision. The time is arbitrary.
                 *
                 * TODO: fix this race condition.
                 */
                3000
            )
        }
        this.auth.cacheWatcher.onDidCreate(() => refreshConn('create'))
        this.auth.cacheWatcher.onDidDelete(() => refreshConn('delete'))
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
        if (this.activeConnection) {
            SecondaryAuth.logIfChanged(
                indent(
                    `secondaryAuth: connectionId=${
                        this.activeConnection.id
                    }, connectionStatus=${this.auth.getConnectionState(this.activeConnection)}`,
                    4,
                    true
                )
            )
        }
        return !!this.activeConnection && this.auth.getConnectionState(this.activeConnection) === 'invalid'
    }

    public get state() {
        return this.auth.getStateMemento()
    }

    public async saveConnection(conn: T) {
        // TODO: fix this
        // eslint-disable-next-line aws-toolkits/no-banned-usages
        await this.state.update(this.key, conn.id)
        this.#savedConnection = conn
        this.#onDidChangeActiveConnection.fire(this.activeConnection)
    }

    /**
     * Globally deletes the connection that this secondary auth is using,
     * effectively doing a signout.
     */
    @withTelemetryContext({ name: 'deleteConnection', class: secondaryAuthClassName })
    public async deleteConnection() {
        if (this.activeConnection) {
            await this.auth.deleteConnection(this.activeConnection)
            await this.clearSavedConnection()
        }
    }

    /**
     * @warning Intended for a single use case where we need to let one service "forget" about a
     * connection but leave it intact for other services. This may have unintended consequences.
     * Use `deleteConnection()` instead.
     *
     * Clears the connection in use without deleting it or logging out.
     */
    public async forgetConnection() {
        getLogger().debug('running SecondaryAuth:forgetConnection()')
        await this.clearSavedConnection()
        await this.clearActiveConnection()
    }

    /** Stop using the saved connection and fallback to using the active connection, if it is usable. */
    public async clearSavedConnection() {
        // TODO: fix this
        // eslint-disable-next-line aws-toolkits/no-banned-usages
        await this.state.update(this.key, undefined)
        this.#savedConnection = undefined
        this.#onDidChangeActiveConnection.fire(this.activeConnection)
    }

    public async clearActiveConnection() {
        this.#activeConnection = undefined
        if (this.#savedConnection) {
            /**
             * No need to emit event since user is currently
             * using the saved connection
             */
            return
        }
        this.#onDidChangeActiveConnection.fire(undefined)
    }

    @withTelemetryContext({ name: 'useNewConnection', class: secondaryAuthClassName })
    public async useNewConnection(conn: T): Promise<T> {
        await this.saveConnection(conn)
        if (this.auth.activeConnection === undefined) {
            // Since no connection exists yet in the "primary" auth, we will make
            // this connection available to all primary auth users
            await this.auth.useConnection(conn)
        }

        return conn
    }

    public async addScopes(conn: T & SsoConnection, extraScopes: string[]) {
        return await addScopes(conn, extraScopes, this.auth)
    }

    private hasRunRestoreConnection = false

    // Used to lazily restore persisted connections.
    // Kind of clunky. We need an async module loader layer to make things ergonomic.
    @withTelemetryContext({ name: 'restoreConnection', class: secondaryAuthClassName })
    public async restoreConnection(force: boolean = false): Promise<T | undefined> {
        if (!force && (this.activeConnection !== undefined || this.hasRunRestoreConnection)) {
            return
        }
        this.hasRunRestoreConnection = true

        try {
            return await telemetry.auth_modifyConnection.run(async (span) => {
                span.record({
                    source: asStringifiedStack(telemetry.getFunctionStack()),
                    action: 'restore',
                    id: 'undefined',
                    connectionState: 'undefined',
                })
                await this.auth.tryAutoConnect()
                this.#savedConnection = await this._loadSavedConnection(span)
                this.#onDidChangeActiveConnection.fire(this.activeConnection)

                const conn = this.#savedConnection
                if (conn) {
                    span.record({
                        connectionState: this.auth.getConnectionState(conn),
                        ...(await getTelemetryMetadataForConn(conn)),
                    })
                }

                return this.#savedConnection
            })
        } catch (err) {
            getLogger().warn(`auth (${this.toolId}): failed to restore connection: %s`, err)
        }
    }

    /**
     * Provides telemetry if called by restoreConnection() (or another auth_modifyConnection context)
     */
    private async _loadSavedConnection(span: Span<AuthModifyConnection>) {
        const id = this.getStateConnectionId()
        if (id === undefined) {
            return
        }

        const conn = await this.auth.getConnection({ id })
        if (conn === undefined) {
            getLogger().warn(`auth (${this.toolId}): removing saved connection "${this.key}" as it no longer exists`)
            await this.state.update(this.key, undefined)
        } else if (!this.isUsable(conn)) {
            getLogger().warn(`auth (${this.toolId}): saved connection "${this.key}" is not valid`)
            await this.state.update(this.key, undefined)
        } else {
            const getAuthStatus = (state: ReturnType<typeof this.auth.getConnectionState>): AuthStatus => {
                return state === 'invalid' ? 'expired' : 'connected'
            }

            let connectionState = this.auth.getConnectionState(conn)

            // This function is expected to be called in the context of restoreConnection()
            span.record({
                connectionState,
                authStatus: getAuthStatus(connectionState),
            })

            try {
                await this.auth.refreshConnectionState(conn)

                connectionState = this.auth.getConnectionState(conn)
                span.record({
                    connectionState,
                    authStatus: getAuthStatus(connectionState),
                })
            } catch (err) {
                // The purpose of this function is load a saved connection into memory, not manage the state.
                // If updating the state fails, then we should delegate downstream to handle getting the proper state.
                getLogger().error('loadSavedConnection: Failed to refresh connection state: %s', err)
                if (isNetworkError(err) && connectionState === 'valid') {
                    span.record({
                        authStatus: 'connectedWithNetworkError',
                    })
                }
            }
            return conn
        }
    }

    private getStateConnectionId() {
        return cast(this.state.get(this.key), Optional(String))
    }
}

/**
 * Used to add scopes to a connection, usually when re-using a connection across extensions.
 * It does not invalidate or otherwise change the state of the connection, but it does
 * trigger listeners for connection updates.
 *
 * How connections and scopes currently work for both this quickpick and the common Login page:
 * - Don't request AWS scopes if we are signing into Amazon Q
 * - Request AWS scopes for explorer sign in. Request AWS + CodeCatalyst scopes for CC sign in.
 * - Request scope difference if re-using a connection. Cancelling or otherwise failing to get the new scopes does NOT invalidate the connection.
 * - Adding scopes updates the connection profile, but does not change its state.
 *
 * Note: This should exist in connection.ts or utils.ts, but due to circular dependencies, it must go here.
 */
export async function addScopes(conn: SsoConnection, extraScopes: string[], auth = Auth.instance) {
    return telemetry.function_call.run(
        async () => {
            const oldScopes = conn.scopes ?? []
            const newScopes = Array.from(new Set([...oldScopes, ...extraScopes]))

            const updatedConn = await setScopes(conn, newScopes, auth)

            try {
                return await auth.reauthenticate(updatedConn, false)
            } catch (e) {
                // We updated the connection scopes pre-emptively, but if there is some issue (e.g. user cancels,
                // InvalidGrantException, etc), then we need to revert to the old connection scopes. Otherwise,
                // this could soft-lock users into a broken connection that cannot be re-authenticated without
                // first deleting the connection.
                await setScopes(conn, oldScopes, auth)
                throw e
            }
        },
        { emit: false, functionId: { name: 'addScopesSecondaryAuth' } }
    )
}

export function setScopes(conn: SsoConnection, scopes: string[], auth = Auth.instance): Promise<SsoConnection> {
    return telemetry.function_call.run(
        () => {
            return auth.updateConnection(conn, {
                type: 'sso',
                scopes,
                startUrl: conn.startUrl,
                ssoRegion: conn.ssoRegion,
            })
        },
        { emit: false, functionId: { name: 'setScopesSecondaryAuth' } }
    )
}
