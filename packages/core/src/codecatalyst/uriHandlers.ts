/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SearchParams, UriHandler } from '../shared/vscode/uriHandler'
import { getCodeCatalystConfig } from '../shared/clients/codecatalystClient'
import { CodeCatalystCommands } from './commands'
import { builderIdStartUrl } from '../auth/sso/model'
import { defaultSsoRegion } from '../auth/connection'
import { getLogger } from '../shared/logger'

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
            await commands.cloneRepo.execute(undefined, params.url)
        } else {
            await vscode.commands.executeCommand('git.clone', params.url.toString())
        }
    }

    async function connectHandler(params: ConnectParams) {
        await commands.openDevEnv.execute(
            undefined,
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
    const params = query.getFromKeysOrThrow('devEnvironmentId', 'spaceName', 'projectName')

    try {
        const ssoParams = query.getFromKeysOrThrow('sso_start_url', 'sso_region')
        return { ...params, sso: { startUrl: ssoParams.sso_start_url, region: ssoParams.sso_region } }
    } catch {
        getLogger().debug(`No IdC SSO params provided in CodeCatalyst URI, defaulting to Builder ID.`)
        return { ...params, sso: { startUrl: builderIdStartUrl, region: defaultSsoRegion } }
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
