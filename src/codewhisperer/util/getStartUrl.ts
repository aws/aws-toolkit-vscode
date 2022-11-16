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
import { createStartUrlPrompter } from '../../credentials/auth'

export const getStartUrl = async () => {
    const inputBox = await createStartUrlPrompter('CodeWhisperer')
    const userInput = await inputBox.prompt()
    if (!isValidResponse(userInput)) {
        throw new CancellationError('user')
    }
    try {
        await AuthUtil.instance.connectToEnterpriseSso(userInput)
    } catch (e) {
        throw ToolkitError.chain(e, CodeWhispererConstants.failedToConnectSso, { code: 'FailedToConnect' })
    }
    await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
    await vscode.commands.executeCommand('aws.codeWhisperer.enableCodeSuggestions')
}
