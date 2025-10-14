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
            await deeplinkConnect(
                ctx,
                params.connection_identifier,
                params.session,
                `${params.ws_url}&cell-number=${params['cell-number']}`,
                params.token,
                params.domain,
                params.app_type
            )
        })
    }

    return vscode.Disposable.from(ctx.uriHandler.onPath('/connect/sagemaker', connectHandler, parseConnectParams))
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
