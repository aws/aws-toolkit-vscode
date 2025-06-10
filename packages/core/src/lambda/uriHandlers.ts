/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { SearchParams } from '../shared/vscode/uriHandler'
import { showConfirmationMessage } from '../shared/utilities/messages'
import globals from '../shared/extensionGlobals'
import { VSCODE_EXTENSION_ID } from '../shared/extensions'

const localize = nls.loadMessageBundle()

export function registerLambdaUriHandler() {
    async function openFunctionHandler(params: ReturnType<typeof parseOpenParams>) {
        const response = await showConfirmationMessage({
            prompt: localize(
                'AWS.lambda.uriUnavailable',
                'The URI you are attempting to access is not in this version of the Toolkit'
            ),
            confirm: localize('AWS.installLatest', 'Install latest'),
        })
        if (response) {
            await vscode.commands.executeCommand('extension.open', VSCODE_EXTENSION_ID.awstoolkit)
        }
    }

    return vscode.Disposable.from(
        globals.uriHandler.onPath('/lambda/load-function', openFunctionHandler, parseOpenParams)
    )
}
function parseOpenParams(query: SearchParams) {
    return {
        functionName: query.getOrThrow(
            'functionName',
            localize('AWS.lambda.open.missingName', 'A function name must be provided')
        ),
        region: query.getOrThrow('region', localize('AWS.lambda.open.missingRegion', 'A region must be provided')),
        isCfn: query.get('isCfn'),
    }
}
