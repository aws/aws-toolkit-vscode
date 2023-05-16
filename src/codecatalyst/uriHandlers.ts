/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SearchParams, UriHandler } from '../shared/vscode/uriHandler'
import { getCodeCatalystConfig } from '../shared/clients/codecatalystClient'
import { CodeCatalystCommands } from './commands'

export function register(
    handler: UriHandler,
    commands: Pick<typeof CodeCatalystCommands.declared, 'cloneRepo' | 'openDevEnv'>
) {
    async function cloneHandler(params: ReturnType<typeof parseCloneParams>) {
        if (params.url.authority.endsWith(getCodeCatalystConfig().gitHostname)) {
            await commands.cloneRepo.execute(params.url)
        } else {
            await vscode.commands.executeCommand('git.clone', params.url.toString())
        }
    }

    async function connectHandler(params: ReturnType<typeof parseConnectParams | typeof parseConnectParamsOld>) {
        await commands.openDevEnv.execute({
            id: params.devEnvironmentId,
            org: { name: 'spaceName' in params ? params.spaceName : params.organizationName },
            project: { name: params.projectName },
        })
    }

    return vscode.Disposable.from(
        handler.registerHandler('/clone', cloneHandler, parseCloneParams),
        handler.registerHandler('/connect/codecatalyst', connectHandler, parseConnectParams),
        handler.registerHandler('/connect/caws', connectHandler, parseConnectParamsOld) // FIXME: remove this before GA
    )
}

function parseCloneParams(query: SearchParams) {
    return { url: query.getAsOrThrow('url', 'A URL must be provided', v => vscode.Uri.parse(v, true)) }
}

function parseConnectParams(query: SearchParams) {
    return query.getFromKeysOrThrow('devEnvironmentId', 'spaceName', 'projectName')
}

function parseConnectParamsOld(query: SearchParams) {
    return query.getFromKeysOrThrow('devEnvironmentId', 'organizationName', 'projectName')
}
