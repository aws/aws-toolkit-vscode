/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SearchParams, UriHandler } from '../shared/vscode/uriHandler'
import { getCodeCatalystConfig } from '../shared/clients/codecatalystClient'
import { CodeCatalystCommands } from './commands'

type ConnectParams = {
    devEnvironmentId: string
    spaceName: string
    projectName: string
    sso?: {
        startUrl: string
        region: string
    }
}

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

    async function connectHandler(params: ConnectParams) {
        await commands.openDevEnv.execute(
            {
                id: params.devEnvironmentId,
                org: { name: params.spaceName },
                project: { name: params.projectName },
            },
            undefined,
            params.sso
        )
    }

    return vscode.Disposable.from(
        handler.onPath('/clone', cloneHandler, parseCloneParams),
        handler.onPath('/connect/codecatalyst', connectHandler, parseConnectParams),
        handler.onPath('/connect/caws', connectHandler, parseConnectParamsOld) // FIXME: remove this before GA
    )
}

function parseCloneParams(query: SearchParams) {
    return { url: query.getAsOrThrow('url', 'A URL must be provided', v => vscode.Uri.parse(v, true)) }
}

export function parseConnectParams(query: SearchParams): ConnectParams {
    try {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const { sso_start_url, sso_region, ...rest } = query.getFromKeysOrThrow(
            'devEnvironmentId',
            'spaceName',
            'projectName',
            'sso_start_url',
            'sso_region'
        )
        return { ...rest, sso: { startUrl: sso_start_url, region: sso_region } }
    } catch {
        return query.getFromKeysOrThrow('devEnvironmentId', 'spaceName', 'projectName')
    }
}

function parseConnectParamsOld(query: SearchParams): ConnectParams {
    const params = query.getFromKeysOrThrow('devEnvironmentId', 'organizationName', 'projectName')
    return {
        devEnvironmentId: params.devEnvironmentId,
        spaceName: params.organizationName,
        projectName: params.projectName,
    }
}
