/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as CodeWhispererConstants from '../models/constants'
import { isValidResponse } from '../../shared/wizards/wizard'
import { AuthUtil } from './authUtil'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { ToolkitError } from '../../shared/errors'
import { telemetry } from '../../shared/telemetry/telemetry'
import { codewhispererScopes } from '../../auth/connection'
import { createStartUrlPrompter, showRegionPrompter } from '../../auth/utils'

export const getStartUrl = async () => {
    const inputBox = await createStartUrlPrompter('IAM Identity Center', codewhispererScopes)
    const userInput = await inputBox.prompt()
    if (!isValidResponse(userInput)) {
        telemetry.ui_click.emit({ elementId: 'connection_optionescapecancel' })
        throw new CancellationError('user')
    }
    telemetry.ui_click.emit({ elementId: 'connection_startUrl' })
    const region = await showRegionPrompter()
    telemetry.ui_click.emit({ elementId: 'connection_region' })
    try {
        await AuthUtil.instance.connectToEnterpriseSso(userInput, region.id)
    } catch (e) {
        throw ToolkitError.chain(e, CodeWhispererConstants.failedToConnectIamIdentityCenter, {
            code: 'FailedToConnect',
        })
    }
    await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
    await vscode.commands.executeCommand('aws.codeWhisperer.enableCodeSuggestions')
}
