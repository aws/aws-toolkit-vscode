/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

export const logOutputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('AWS Toolkit Logs')

/**
 * Shows the log output channel.
 */
export function showLogOutputChannel({ preserveFocus = true }: { preserveFocus?: boolean } = {}): void {
    logOutputChannel.show(preserveFocus)
}
