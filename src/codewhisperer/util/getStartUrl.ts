/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as CodeWhispererConstants from '../models/constants'
import { isValidResponse } from '../../shared/wizards/wizard'
import { AuthUtil, amazonQScopes } from './authUtil'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { ToolkitError } from '../../shared/errors'
import { telemetry } from '../../shared/telemetry/telemetry'
import { createStartUrlPrompter, showRegionPrompter } from '../../auth/utils'
import { Region } from '../../shared/regions/endpoints'
import { Commands } from '../../shared/vscode/commands2'

export const getStartUrl = async () => {
    const inputBox = await createStartUrlPrompter('IAM Identity Center', amazonQScopes)
    const userInput = await inputBox.prompt()
    if (!isValidResponse(userInput)) {
        telemetry.ui_click.emit({ elementId: 'connection_optionescapecancel' })
        throw new CancellationError('user')
    }
    telemetry.ui_click.emit({ elementId: 'connection_startUrl' })
    const region = await showRegionPrompter()
    telemetry.ui_click.emit({ elementId: 'connection_region' })
    return connectToEnterpriseSso(userInput, region.id)
}

export async function connectToEnterpriseSso(startUrl: string, region: Region['id']) {
    try {
        await AuthUtil.instance.connectToEnterpriseSso(startUrl, region)
    } catch (e) {
        throw ToolkitError.chain(e, CodeWhispererConstants.failedToConnectIamIdentityCenter, {
            code: 'FailedToConnect',
        })
    }
    await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
    await Commands.tryExecute('aws.amazonq.refresh')
    await vscode.commands.executeCommand('aws.codeWhisperer.enableCodeSuggestions')
}
