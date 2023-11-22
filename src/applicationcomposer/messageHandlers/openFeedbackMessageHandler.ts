/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'

export function openFeedbackMessageHandler() {
    void vscode.commands.executeCommand('aws.submitFeedback')
}
