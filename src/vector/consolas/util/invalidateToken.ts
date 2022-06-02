/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../../shared/extensionGlobals'
import { ConsolasConstants } from '../models/constants'

export const invalidateAccessToken = async () => {
    globals.context.globalState.update(ConsolasConstants.accessToken, undefined)
    await vscode.commands.executeCommand('aws.consolas.refresh')
}
