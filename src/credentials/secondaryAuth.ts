/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../shared/extensionGlobals'

import * as vscode from 'vscode'
import { getLogger } from '../shared/logger'
import { showQuickPick } from '../shared/ui/pickerPrompter'
import { cast, Optional } from '../shared/utilities/typeConstructors'
import { Auth, Connection, StatefulConnection } from './auth'
import { once } from '../shared/utilities/functionUtils'
import { telemetry } from '../shared/telemetry/telemetry'
import { createExitButton, createHelpButton } from '../shared/ui/buttons'
import { isNonNullable } from '../shared/utilities/tsUtils'

async function promptUseNewConnection(newConn: Connection, oldConn: Connection, tools: string[], swapNo: boolean) {
    // Multi-select picker would be better ?
    const saveConnectionItem = {
        label: `Yes, keep using ${newConn.label} with ${tools.join(', ')} while using ${
            oldConn.label
        } with other services.`,
        detail: `To remove later, select "Remove Connection from Tool" from the tool's context (right-click) menu.`,
        data: 'yes',
    } as const

    const useConnectionItem = {
        label: `No, switch everything to authenticate with ${(swapNo ? newConn : oldConn).label}.`,
        detail: 'This will not log you out; you can reconnect at any time by switching connections.',
        data: 'no',
    } as const

    const helpButton = createHelpButton()
    const openLink = helpButton.onClick.bind(helpButton)
    helpButton.onClick = () => {
        telemetry.ui_click.emit({ elementId: 'connection_multiple_auths_help' })
        openLink()
    }

    const resp = await showQuickPick([saveConnectionItem, useConnectionItem], {
        title: `Some tools you've been using don't work with ${newConn.label}. Keep using ${newConn.label} in the background while using ${oldConn.label}?`,
        placeholder: 'Confirm choice',
        buttons: [helpButton, createExitButton()],
    })

    switch (resp) {
        case 'yes':
            telemetry.ui_click.emit({ elementId: 'connection_multiple_auths_yes' })
            break
        case 'no':
            telemetry.ui_click.emit({ elementId: 'connection_multiple_auths_no' })
            break
        default:
            telemetry.ui_click.emit({ elementId: 'connection_multiple_auths_exit' })
    }

    return resp
}

let oldConn: Auth['activeConnection']
const auths = new Map<string, SecondaryAuth>()
const registerAuthListener = once(() => {
    Auth.instance.onDidChangeActiveConnection(async conn => {
        const potentialConn = oldConn
        if (conn !== undefined && potentialConn?.state === 'valid') {
            const saveableAuths = Array.from(auths.values()).filter(
                a => !a.isUsingSavedConnection && a.isUsable(potentialConn) && !a.isUsable(conn)
            )
            const toolNames = saveableAuths.map(a => a.toolLabel)
            if (
                saveableAuths.length > 0 &&
                (await promptUseNewConnection(potentialConn, conn, toolNames, false)) === 'yes'
            ) {
                await Promise.all(saveableAuths.map(a => a.saveConnection(potentialConn)))
            }
        }

        oldConn = conn
    })
})

export function getSecondaryAuth<T extends Connection>(
    toolId: string,
    toolLabel: string,
    isValid: (conn: Connection) => conn is T
): SecondaryAuth<T> {
    const auth = new SecondaryAuth(toolId, toolLabel, isValid)
    auths.set(toolId, auth)
    registerAuthListener()

    auth.onDidChangeActiveConnection(() => onDidChangeConnectionsEmitter.fire())

    return auth
}

/**
 * Gets all {@link SecondaryAuth} instances that have saved the connection
 */
export function getDependentAuths(conn: Connection): SecondaryAuth[] {
    return Array.from(auths.values()).filter(
        auth => auth.isUsingSavedConnection && auth.activeConnection?.id === conn.id
    )
}

export function getAllConnectionsInUse(auth = Auth.instance): StatefulConnection[] {
    const connMap = new Map<Connection['id'], StatefulConnection>()
    const toolConns = Array.from(auths.values())
        .filter(a => a.isUsingSavedConnection)
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
    private readonly onDidChangeActiveConnectionEmitter = new vscode.EventEmitter<T | undefined>()
    public readonly onDidChangeActiveConnection = this.onDidChangeActiveConnectionEmitter.event

    public constructor(
        public readonly toolId: string,
        public readonly toolLabel: string,
        public readonly isUsable: (conn: Connection) => conn is T,
        private readonly auth = Auth.instance,
        private readonly memento = globals.context.globalState
    ) {
        this.auth.onDidChangeActiveConnection(async conn => {
            if (
                conn === undefined &&
                this.#savedConnection &&
                this.#savedConnection.id === this.#activeConnection?.id
            ) {
                await this.removeConnection()
            } else {
                this.#activeConnection = conn
                this.onDidChangeActiveConnectionEmitter.fire(this.activeConnection)
            }
        })
    }

    public get activeConnection(): T | undefined {
        return (
            this.#savedConnection ??
            (this.#activeConnection && this.isUsable(this.#activeConnection) ? this.#activeConnection : undefined)
        )
    }

    public get isUsingSavedConnection() {
        return this.#savedConnection !== undefined
    }

    public get isConnectionExpired() {
        return !!this.activeConnection && this.auth.getConnectionState(this.activeConnection) === 'invalid'
    }

    public async saveConnection(conn: T) {
        await this.memento.update(this.key, conn.id)
        this.#savedConnection = conn
        this.onDidChangeActiveConnectionEmitter.fire(this.activeConnection)
    }

    public async removeConnection() {
        await this.memento.update(this.key, undefined)
        this.#savedConnection = undefined
        this.onDidChangeActiveConnectionEmitter.fire(this.activeConnection)
    }

    public async useNewConnection(conn: T) {
        if (this.auth.activeConnection !== undefined && !this.isUsable(this.auth.activeConnection)) {
            if ((await promptUseNewConnection(conn, this.auth.activeConnection, [this.toolLabel], true)) === 'yes') {
                await this.saveConnection(conn)
            } else {
                await this.auth.useConnection(conn)
            }
        } else {
            await this.auth.useConnection(conn)
        }
    }

    // Used to lazily restore persisted connections.
    // Kind of clunky. We need an async module loader layer to make things ergonomic.
    public readonly restoreConnection: () => Promise<T | undefined> = once(async () => {
        try {
            await this.auth.tryAutoConnect()
            this.#savedConnection = await this.loadSavedConnection()
            this.onDidChangeActiveConnectionEmitter.fire(this.activeConnection)

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
