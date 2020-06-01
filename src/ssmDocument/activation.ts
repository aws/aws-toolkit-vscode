/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { activation as activateLanguageServer } from './ssmdocLanguage/ssmdocClient'
import { AwsContext } from '../shared/awsContext'

// Activate Step Functions related functionality for the extension.

export async function activate(
    extensionContext: vscode.ExtensionContext,
    awsContext: AwsContext,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    await activateLanguageServer(extensionContext)
}
