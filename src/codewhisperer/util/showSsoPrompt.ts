/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { getStartUrl } from './getStartUrl'
import { showQuickPick } from '../../shared/ui/pickerPrompter'
import { AuthUtil, isUpgradeableConnection } from './authUtil'
import { failedToConnectAwsBuilderId } from '../models/constants'
import { isValidResponse } from '../../shared/wizards/wizard'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { isUserCancelledError, ToolkitError } from '../../shared/errors'
import { createCommonButtons } from '../../shared/ui/buttons'
import { Auth } from '../../credentials/auth'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { createBuilderIdItem, createIamItem, createSsoItem } from '../../credentials/auth'
import { telemetry } from '../../shared/telemetry/telemetry'

export const showConnectionPrompt = async () => {
    const currentConn = Auth.instance.activeConnection
    if (isUpgradeableConnection(currentConn)) {
        const didUpgrade = await AuthUtil.instance.promptUpgrade(currentConn, 'current').catch(err => {
            if (!isUserCancelledError(err)) {
                getLogger().error('codewhisperer: failed to upgrade connection: %s', err)
                showViewLogsMessage('Failed to upgrade current connection.')
            }

            return false
        })

        if (didUpgrade) {
            return
        }
    }

    const resp = await showQuickPick([createBuilderIdItem(), createSsoItem(), createCodeWhispererIamItem()], {
        title: 'CodeWhisperer: Add Connection to AWS',
        placeholder: 'Select a connection option to start using CodeWhisperer',
        buttons: createCommonButtons() as vscode.QuickInputButton[],
    })

    if (!isValidResponse(resp)) {
        telemetry.ui_click.emit({ elementId: 'connection_optionescapecancel' })
        throw new CancellationError('user')
    }
    switch (resp) {
        case 'iam':
            throw new Error('IAM is not supported')
        case 'sso': {
            return await getStartUrl()
        }
        case 'builderId': {
            return await awsIdSignIn()
        }
    }
}

export async function awsIdSignIn() {
    getLogger().info('selected AWS ID sign in')
    try {
        await AuthUtil.instance.connectToAwsBuilderId()
    } catch (e) {
        throw ToolkitError.chain(e, failedToConnectAwsBuilderId, { code: 'FailedToConnect' })
    }
    await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
    await vscode.commands.executeCommand('aws.codeWhisperer.enableCodeSuggestions')
}

export const createCodeWhispererIamItem = () => {
    const item = createIamItem()
    item.detail = 'Not supported by CodeWhisperer.'
    item.description = 'not supported'
    item.invalidSelection = true

    return item
}
