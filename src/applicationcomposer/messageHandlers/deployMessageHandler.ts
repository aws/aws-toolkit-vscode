/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { WebviewContext } from '../types'

export function deployMessageHandler(context: WebviewContext) {
    vscode.commands.executeCommand('aws.samcli.sync')
}
