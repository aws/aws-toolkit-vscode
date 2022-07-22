/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../shared/extensionGlobals'
import { CodeWhispererConstants } from '../models/constants'

export const invalidateAccessToken = async () => {
    await globals.context.globalState.update(CodeWhispererConstants.accessToken, undefined)
    await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
}
