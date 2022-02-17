/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SearchParams, UriHandler } from '../shared/vscode/uriHandler'
import { cloneCawsRepo, login, openDevEnv } from './commands'
import { cawsHostname } from '../shared/clients/cawsClient'

import globals from '../shared/extensionGlobals'

export function register(handler: UriHandler) {
    return vscode.Disposable.from(
        handler.registerHandler('/clone', handleCloneParams, parseCloneParams),
        handler.registerHandler('/connect/caws', handleConnectParams, parseConnectParams)
    )
}

function parseCloneParams(query: SearchParams) {
    return { url: query.getAsOrThrow('url', 'A URL must be provided', v => vscode.Uri.parse(v, true)) }
}

function parseConnectParams(query: SearchParams) {
    return query.getFromKeysOrThrow(['developmentWorkspaceId', 'organizationName', 'projectName'] as const)
}

async function handleCloneParams(params: { url: vscode.Uri }): Promise<void> {
    if (params.url.authority.endsWith(cawsHostname)) {
        await cloneCawsRepo(params.url)
    } else {
        await vscode.commands.executeCommand('git.clone', params.url.toString())
    }
}

async function handleConnectParams(params: ReturnType<typeof parseConnectParams>): Promise<void> {
    const client = globals.caws

    if (!globals.caws.connected() && !(await login(globals.context, globals.awsContext, globals.caws))) {
        return
    }

    const env = await client.getDevEnv(params) // just let the error bubble, we're catching it anyway

    if (!env) {
        throw new Error(`No workspace found with parameters: ${JSON.stringify(params, undefined, 4)}`)
    }

    await openDevEnv(client, env)
}
