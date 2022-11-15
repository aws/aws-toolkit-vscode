/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SearchParams, UriHandler } from '../shared/vscode/uriHandler'
import { getCodeCatalystConfig } from '../shared/clients/codecatalystClient'
import { CodeCatalystCommands } from './commands'
import { telemetry } from '../shared/telemetry/telemetry'

export function register(
    handler: UriHandler,
    commands: Pick<typeof CodeCatalystCommands.declared, 'cloneRepo' | 'openDevEnv'>
) {
    async function cloneHandler(params: ReturnType<typeof parseCloneParams>) {
        telemetry.codecatalyst_localClone.record({ source: 'UriHandler' })

        if (params.url.authority.endsWith(getCodeCatalystConfig().gitHostname)) {
            await commands.cloneRepo.execute(params.url)
        } else {
            await vscode.commands.executeCommand('git.clone', params.url.toString())
        }
    }

    async function connectHandler(params: ReturnType<typeof parseConnectParams>) {
        telemetry.codecatalyst_connect.record({ source: 'UriHandler' })

        await commands.openDevEnv.execute({
            id: params.devEnvironmentId,
            org: { name: params.spaceName },
            project: { name: params.projectName },
        })
    }

    return vscode.Disposable.from(
        handler.registerHandler('/clone', cloneHandler, parseCloneParams),
        handler.registerHandler('/connect/codecatalyst', connectHandler, parseConnectParams)
    )
}

function parseCloneParams(query: SearchParams) {
    return { url: query.getAsOrThrow('url', 'A URL must be provided', v => vscode.Uri.parse(v, true)) }
}

function parseConnectParams(query: SearchParams) {
    return query.getFromKeysOrThrow('devEnvironmentId', 'spaceName', 'projectName')
}
