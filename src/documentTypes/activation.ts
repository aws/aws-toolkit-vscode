/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { activateDocumentsLanguageServer } from './server'
import { Experiments } from '../shared/settings'
import { LanguageClient } from 'vscode-languageclient'
import { getLogger } from '../shared/logger'

const logger = getLogger()

export class DocumentsLanguageServer {
    protected static _instance: DocumentsLanguageServer | undefined = undefined
    private _server: LanguageClient | undefined = undefined

    private constructor() {}

    static get instance(): DocumentsLanguageServer {
        return (this._instance ??= new this())
    }

    /** True if `aws.experiments.lsp` is enabled in the settings */
    isEnabled(): boolean {
        return Experiments.instance.get('lsp', false)
    }

    isRunning(): boolean {
        return this._server !== undefined
    }

    /** Starts the actual language server if not already running. */
    async start(extensionContext: vscode.ExtensionContext): Promise<undefined> {
        if (!this.isRunning()) {
            this._server = await activateDocumentsLanguageServer(extensionContext)
        }
        logger.info('Documents Language Server is running.')
        return
    }
}

export async function tryActivate(extensionContext: vscode.ExtensionContext): Promise<void> {
    if (DocumentsLanguageServer.instance.isEnabled()) {
        await DocumentsLanguageServer.instance.start(extensionContext)
    } else if (DocumentsLanguageServer.instance.isRunning()) {
        await promptReloadToDisableLsp()
    }
}

/**
 * Currently, running `stop()` on the {@link LanguageClient}
 * does not work. Reloading the window is the next best option.
 *
 * TODO: For some reason `stop()` fails since the Rust LS
 * is returning an invalid response.
 */
async function promptReloadToDisableLsp(): Promise<void> {
    const res = await vscode.window.showInformationMessage('Reload window to disable?', 'Yes')
    switch (res) {
        case 'Yes': {
            vscode.commands.executeCommand('workbench.action.reloadWindow')
            break
        }
        default: {
            Experiments.instance.update('lsp', true)
            break
        }
    }
}
