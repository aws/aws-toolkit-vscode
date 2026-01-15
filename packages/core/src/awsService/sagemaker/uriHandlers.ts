/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SearchParams } from '../../shared/vscode/uriHandler'
import { deeplinkConnect } from './commands'
import { ExtContext } from '../../shared/extensions'
import { telemetry } from '../../shared/telemetry/telemetry'

export function register(ctx: ExtContext) {
    async function connectHandler(params: ReturnType<typeof parseConnectParams>) {
        await telemetry.sagemaker_deeplinkConnect.run(async () => {
            const wsUrl = `${params.ws_url}&cell-number=${params['cell-number']}`
            await deeplinkConnect(
                ctx,
                params.connection_identifier,
                params.session,
                wsUrl,
                params.token,
                params.domain,
                params.app_type
            )
        })
    }

    async function hyperPodConnectHandler(params: ReturnType<typeof parseHyperpodConnectParams>) {
        await telemetry.sagemaker_deeplinkConnect.run(async () => {
            const wsUrl = `${params.streamUrl}&cell-number=${params['cell-number']}`
            await deeplinkConnect(
                ctx,
                '',
                params.sessionId,
                wsUrl,
                params.sessionToken,
                '',
                undefined,
                params.workspaceName,
                params.namespace,
                params.clusterArn
            )
        })
    }

    return vscode.Disposable.from(
        ctx.uriHandler.onPath('/connect/sagemaker', connectHandler, parseConnectParams),
        ctx.uriHandler.onPath('/connect/workspace', hyperPodConnectHandler, parseHyperpodConnectParams)
    )
}

export function parseHyperpodConnectParams(query: SearchParams) {
    const requiredParams = query.getFromKeysOrThrow('sessionId', 'streamUrl', 'sessionToken', 'cell-number')
    const optionalParams = query.getFromKeys('workspaceName', 'namespace', 'clusterArn')
    return { ...requiredParams, ...optionalParams }
}
export function parseConnectParams(query: SearchParams) {
    const requiredParams = query.getFromKeysOrThrow(
        'connection_identifier',
        'domain',
        'user_profile',
        'session',
        'ws_url',
        'cell-number',
        'token'
    )
    const optionalParams = query.getFromKeys('app_type')

    return { ...requiredParams, ...optionalParams }
}
