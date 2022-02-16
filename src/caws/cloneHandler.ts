/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { UriHandler } from '../shared/vscode/uriHandler'
import { cloneCawsRepo } from './commands'

const CAWS_AUTHORITY = 'REMOVED.codes'

export function registerCloneHandler(handler: UriHandler) {
    return handler.registerHandler('/clone', handleParams, parseParams)
}

// TODO: don't use URLSearchParams directly? it's not very ergonomic for TypeScript
function parseParams(query: URLSearchParams) {
    if (!query.has('url')) {
        throw new Error('A URL must be provided')
    }

    return { url: vscode.Uri.parse(query.get('url')!, true) }
}

async function handleParams(params: { url: vscode.Uri }): Promise<void> {
    if (params.url.authority.endsWith(CAWS_AUTHORITY)) {
        await cloneCawsRepo(params.url)
    } else {
        vscode.commands.executeCommand('git.clone', params.url.toString())
    }
}
