/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SearchParams, UriHandler } from '../shared/vscode/uriHandler'
import { getCawsConfig } from '../shared/clients/cawsClient'
import { CawsCommands } from './commands'
import { Metric } from '../shared/telemetry/metric'

export function register(
    handler: UriHandler,
    commands: Pick<typeof CawsCommands.declared, 'cloneRepo' | 'openWorkspace'>
) {
    async function cloneHandler(params: ReturnType<typeof parseCloneParams>) {
        Metric.get('caws_localClone').record('source', 'UriHandler')

        if (params.url.authority.endsWith(getCawsConfig().gitHostname)) {
            await commands.cloneRepo.execute(params.url)
        } else {
            await vscode.commands.executeCommand('git.clone', params.url.toString())
        }
    }

    async function connectHandler(params: ReturnType<typeof parseConnectParams>) {
        Metric.get('caws_connect').record('source', 'UriHandler')

        await commands.openWorkspace.execute({
            id: params.developmentWorkspaceId,
            org: { name: params.organizationName },
            project: { name: params.projectName },
        })
    }

    return vscode.Disposable.from(
        handler.registerHandler('/clone', cloneHandler, parseCloneParams),
        handler.registerHandler('/connect/caws', connectHandler, parseConnectParams)
    )
}

function parseCloneParams(query: SearchParams) {
    return { url: query.getAsOrThrow('url', 'A URL must be provided', v => vscode.Uri.parse(v, true)) }
}

function parseConnectParams(query: SearchParams) {
    return query.getFromKeysOrThrow('developmentWorkspaceId', 'organizationName', 'projectName')
}
