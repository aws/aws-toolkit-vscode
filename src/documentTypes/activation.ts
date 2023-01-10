/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { activateDocumentsLanguageServer } from './server'

export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    await activateDocumentsLanguageServer(extensionContext)
}
