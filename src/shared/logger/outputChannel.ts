/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

export const LOG_OUTPUT_CHANNEL: vscode.OutputChannel = vscode.window.createOutputChannel('AWS Toolkit Logs')

/**
 * Shows the log output channel.
 */
export function showLogOutputChannel({ preserveFocus = true }: { preserveFocus?: boolean } = {}): void {
    LOG_OUTPUT_CHANNEL.show(preserveFocus)
}
