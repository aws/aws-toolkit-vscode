/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../logger/logger'

import * as nls from 'vscode-nls'
import { getIdeProperties } from '../extensionUtilities'

const localize = nls.loadMessageBundle()

export class UriHandler implements vscode.UriHandler {
    public constructor() {}

    public async handleUri(uri: vscode.Uri): Promise<void> {
        getLogger().verbose(`UriHandler: received request on path "${uri.path}"`)
        const button = localize(
            'AWS.uriHandler.nohandler.button',
            'Show {0} Toolkit version',
            getIdeProperties().company
        )
        const p = vscode.window.showErrorMessage(
            localize(
                'AWS.uriHandler.nohandler',
                'This version of {0} Toolkit does not handle vscode:// URLs. Check your AWS Toolkit version.',
                getIdeProperties().company
            ),
            'View AWS Toolkit version'
        )
        return p.then(selection => {
            if (selection === button) {
                vscode.commands.executeCommand('aws.aboutToolkit')
            }
        })
    }
}
