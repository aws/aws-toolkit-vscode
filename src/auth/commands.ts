/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { CommandDeclarations, Commands } from '../shared/vscode/commands2'
import { AuthSource, showAuthWebview } from './ui/vue/show'
import { ServiceItemId, isServiceItemId } from './ui/vue/types'
import { addConnection, showConnectionsPageCommand } from './utils'
import { isCloud9 } from '../shared/extensionUtilities'

/**
 * The methods with backend logic for the Auth commands.
 */
export class AuthCommandBackend {
    constructor(private readonly extContext: vscode.ExtensionContext) {}

    public showManageConnections(source: AuthSource, serviceToShow?: ServiceItemId) {
        // The auth webview page does not make sense to use in C9,
        // so show the auth quick pick instead.
        if (isCloud9('any')) {
            return addConnection.execute()
        }

        // Edge case where called by vscode UI and non ServiceItemId object
        // is passed in.
        if (typeof source !== 'string') {
            source = 'unknown'
        }

        if (!isServiceItemId(serviceToShow)) {
            serviceToShow = undefined
        }
        return showAuthWebview(this.extContext, source, serviceToShow)
    }
}

/**
 * Declared commands related to Authentication in the toolkit.
 */
export class AuthCommandDeclarations implements CommandDeclarations<AuthCommandBackend> {
    static #instance: AuthCommandDeclarations

    static get instance(): AuthCommandDeclarations {
        return (this.#instance ??= new AuthCommandDeclarations())
    }

    private constructor() {}

    public readonly declared = {
        showManageConnections: Commands.from(AuthCommandBackend).declareShowManageConnections({
            id: showConnectionsPageCommand,
        }),
    } as const
}
