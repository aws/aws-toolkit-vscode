/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandDeclarations, Commands } from '../shared/vscode/commands2'
import * as vscode from 'vscode'
import { showAuthWebview } from './vue/show'

/**
 * The methods with backend logic for the Auth commands.
 */
export class AuthCommandBackend {
    constructor(private readonly extContext: vscode.ExtensionContext) {}

    public async showConnectionsPage() {
        await showAuthWebview(this.extContext)
    }
}

/**
 * Declared commands related to Authentication in the toolkit.
 */
export class AuthCommandDeclarations implements CommandDeclarations<AuthCommandBackend> {
    public readonly declared = {
        showConnectionsPage: Commands.from(AuthCommandBackend).declareShowConnectionsPage({
            id: 'aws.auth.showConnectionsPage',
        }),
    } as const
}
