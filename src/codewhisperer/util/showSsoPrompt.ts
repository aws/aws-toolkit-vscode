/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { getStartUrl } from './getStartUrl'
import { showQuickPick } from '../../shared/ui/pickerPrompter'
import { AuthUtil } from './authUtil'
import { failedToConnectAwsBuilderId } from '../models/constants'
import { isValidResponse } from '../../shared/wizards/wizard'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { ToolkitError } from '../../shared/errors'
import { createCommonButtons } from '../../shared/ui/buttons'
import { createBuilderIdItem, createIamItem, createSsoItem } from '../../auth/auth'
import { telemetry } from '../../shared/telemetry/telemetry'
import { isCloud9 } from '../../shared/extensionUtilities'
import { isIamConnection } from '../../auth/connection'

export const showConnectionPrompt = async () => {
    // Skip this prompt on C9 because:
    // * The UI looks bad with C9's style of pickers
    // * C9 will always start with _some_ form of auth so this prompt is less common
    if (isCloud9()) {
        if (isCloud9('classic')) {
            const iamConn = (await AuthUtil.instance.auth.listConnections()).find(isIamConnection)
            if (iamConn) {
                await AuthUtil.instance.auth.useConnection(iamConn)
            }
        } else {
            await AuthUtil.instance.connectToAwsBuilderId()
        }

        return
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
