/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { SearchParams } from '../shared/vscode/uriHandler'
import { showMessage } from '../shared/utilities/messages'
import globals from '../shared/extensionGlobals'

const localize = nls.loadMessageBundle()

export function registerLambdaUriHandler() {
    async function openFunctionHandler(params: ReturnType<typeof parseOpenParams>) {
        await showMessage(
            'warn',
            localize(
                'AWS.lambda.uriUnavailable',
                'The URI handler you are attempting to open is not handled in this version of the toolkit, try installing the latest version'
            )
        )
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
