/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SearchParams, UriHandler } from '../shared/vscode/uriHandler'
import { ConnectedCawsClient, getCawsConfig } from '../shared/clients/cawsClient'
import { cloneCawsRepo, CawsCommands } from './commands'
import { openDevelopmentWorkspace } from './model'

export function register(handler: UriHandler, commands: Pick<CawsCommands, 'bindClient'>) {
    const tryHandleClone = commands.bindClient(handleCloneParams)
    const tryHandleConnect = commands.bindClient(handleConnectParams)

    return vscode.Disposable.from(
        handler.registerHandler('/clone', tryHandleClone, parseCloneParams),
        handler.registerHandler('/connect/caws', tryHandleConnect, parseConnectParams)
    )
}

function parseCloneParams(query: SearchParams) {
    return { url: query.getAsOrThrow('url', 'A URL must be provided', v => vscode.Uri.parse(v, true)) }
}

function parseConnectParams(query: SearchParams) {
    return query.getFromKeysOrThrow('developmentWorkspaceId', 'organizationName', 'projectName')
}

async function handleCloneParams(
    client: ConnectedCawsClient,
    params: ReturnType<typeof parseCloneParams>
): Promise<void> {
    if (params.url.authority.endsWith(getCawsConfig().gitHostname)) {
        await cloneCawsRepo(client, params.url)
    } else {
        await vscode.commands.executeCommand('git.clone', params.url.toString())
    }
}

async function handleConnectParams(
    client: ConnectedCawsClient,
    params: ReturnType<typeof parseConnectParams>
): Promise<void> {
    await openDevelopmentWorkspace(client, {
        id: params.developmentWorkspaceId,
        org: { name: params.organizationName },
        project: { name: params.projectName },
    })
}
