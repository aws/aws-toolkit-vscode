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
        const enabled = Experiments.instance.get('lsp', false)
        logger.info(`Documents LS is enabled=${enabled}`)
        return enabled
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

    /** Stops the actual language server if not already stopped. */
    async stop(): Promise<undefined> {
        await this._server?.stop()
        logger.info('Documents Language Server is stopped.')
        this._server = undefined
        return
    }
}

/**
 * Starts the actual language server if it should be, otherwise
 * ensures it is not running.
 */
export async function tryActivate(extensionContext: vscode.ExtensionContext): Promise<void> {
    if (DocumentsLanguageServer.instance.isEnabled()) {
        await DocumentsLanguageServer.instance.start(extensionContext)
    } else {
        await DocumentsLanguageServer.instance.stop()
    }
}
