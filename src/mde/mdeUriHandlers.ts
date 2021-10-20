/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/** The 'path' for external URIs attempting to open an MDE within VS Code */
const MDE_URI_PATH = '/remote' as const

import { EnvironmentId } from '../../types/clientmde'
import * as vscode from 'vscode'
import { ParsedUrlQuery } from 'querystring'
import { mdeConnectCommand, mdeCreateCommand, startMde } from './mdeCommands'
import { UriHandler } from '../shared/vscode/uriHandler'
import { MdeClient, mdeEndpoint, MDE_REGION } from '../shared/clients/mdeClient'

interface MdeUriParams {
    /** If no ID is provided, a new MDE is created */
    // TODO: rename to 'environmentId'? all consumers use that, but responses produce 'id'
    id?: EnvironmentId
    cloneUrl?: vscode.Uri
    /** Not implemented */
    branch?: string
}

export function activateUriHandlers(ctx: vscode.ExtensionContext, uriHandler: UriHandler): void {
    ctx.subscriptions.push(uriHandler.registerHandler(MDE_URI_PATH, handleMdeUriParams, parseMdeUriParams))
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

export async function handleMdeUriParams(params: MdeUriParams): Promise<void> {
    // TODO: get region from URI params.
    const region = 'us-west-2'
    const mdeClient = await MdeClient.create(region, mdeEndpoint())
    if (params.id === undefined) {
        const newMde = await mdeCreateCommand(undefined, { repo: params.cloneUrl?.toString() })
        // mde create command swallows the exception
        if (newMde === undefined) {
            return
        }
        params.id = newMde.id
    }

    const mde = await startMde(params as { id: EnvironmentId }, mdeClient)

    if (mde === undefined) {
        return
    }

    return mdeConnectCommand(mde, MDE_REGION)
}
