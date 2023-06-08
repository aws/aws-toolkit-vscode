/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { CommandDeclarations, Commands } from '../shared/vscode/commands2'
import { showAuthWebview } from './ui/vue/show'
import { ServiceItemId, isServiceItemId } from './ui/vue/types'

/**
 * The methods with backend logic for the Auth commands.
 */
export class AuthCommandBackend {
    constructor(private readonly extContext: vscode.ExtensionContext) {}

    public showConnectionsPage(serviceToShow?: ServiceItemId) {
        // Edge case where called by vscode UI and non ServiceItemId object
        // is passed in.
        if (!isServiceItemId(serviceToShow)) {
            serviceToShow = undefined
        }
        return showAuthWebview(this.extContext, serviceToShow)
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
        showConnectionsPage: Commands.from(AuthCommandBackend).declareShowConnectionsPage({
            id: 'aws.auth.showConnectionsPage',
        }),
    } as const
}
