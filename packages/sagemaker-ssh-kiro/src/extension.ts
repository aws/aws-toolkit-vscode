/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This file contains code originally from https://github.com/jeanp413/open-remote-ssh
 * Original copyright: (c) 2022
 * Originally released under MIT license
 */

import * as vscode from 'vscode'
import { SageMakerSshKiroResolver as SageMakerSshKiroResolver, sagemakerSshKiroAuthority } from './authResolver'
import { initializeLogger } from './common/logger'

export async function activate(context: vscode.ExtensionContext) {
    const logger = initializeLogger()
    context.subscriptions.push(logger)

    if (!vscode.env.appName.toLowerCase().includes('kiro')) {
        const errorMessage = 'Amazon SageMaker SSH Plugin for Kiro is only supported in the Kiro IDE'
        logger.error(errorMessage)
        void vscode.window.showErrorMessage(errorMessage)
        return
    }

    try {
        const sagemakerSSHResolver = new SageMakerSshKiroResolver(context, logger)
        context.subscriptions.push(
            vscode.workspace.registerRemoteAuthorityResolver(sagemakerSshKiroAuthority, sagemakerSSHResolver)
        )
        context.subscriptions.push(sagemakerSSHResolver)

        logger.info('Amazon SageMaker SSH Plugin for Kiro activated successfully')
    } catch (error) {
        logger.error(`Amazon SageMaker SSH Plugin for Kiro: Activation failed: ${error}`)
        void vscode.window.showErrorMessage(`SageMaker SSH Extension activation failed: ${error}`)
        throw error
    }
}

export function deactivate() {}
