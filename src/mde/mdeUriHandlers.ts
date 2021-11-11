/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/** The 'path' for external URIs attempting to open an MDE within VS Code */
const MDE_URI_PATH = '/remote' as const

import { EnvironmentId } from '../../types/clientmde'
import * as vscode from 'vscode'
import { ParsedUrlQuery } from 'querystring'
import { mdeConnectCommand } from './mdeCommands'
import { UriHandler } from '../shared/vscode/uriHandler'
import { ExtContext } from '../shared/extensions'
import { createMdeWebview } from './vue/create/backend'

interface MdeUriParams {
    /** If no ID is provided, a new MDE is created */
    // TODO: rename to 'environmentId'? all consumers use that, but responses produce 'id'
    id?: EnvironmentId
    cloneUrl?: vscode.Uri
    branch?: string
}

export function activateUriHandlers(ctx: ExtContext, uriHandler: UriHandler): void {
    ctx.extensionContext.subscriptions.push(
        uriHandler.registerHandler(MDE_URI_PATH, handleMdeUriParams.bind(ctx), parseMdeUriParams)
    )
}

export function parseMdeUriParams(query: ParsedUrlQuery): MdeUriParams {
    const result: MdeUriParams = {}

    result.id = typeof query.id === 'string' ? query.id : undefined
    result.cloneUrl = typeof query.cloneUrl === 'string' ? vscode.Uri.parse(query.cloneUrl, true) : undefined
    result.branch = typeof query.branch === 'string' ? query.branch : undefined

    if (result.branch !== undefined && result.cloneUrl === undefined) {
        throw new Error('Cannot clone without a source URL')
    }

    return result
}

export async function handleMdeUriParams(this: ExtContext, params: MdeUriParams): Promise<void> {
    // TODO: get region from URI params.
    const region = 'us-west-2'

    if (params.id === undefined) {
        const repo = params.cloneUrl ? { url: params.cloneUrl.toString(), branch: params.branch } : undefined
        const newMde = await createMdeWebview(this, repo)

        if (newMde === undefined) {
            return
        }
        params.id = newMde.id
    } else {
        await mdeConnectCommand({ id: params.id }, region)
    }
}
