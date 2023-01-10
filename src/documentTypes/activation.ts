/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { activateDocumentsLanguageServer } from './server'
import { Experiments } from '../shared/settings'

export async function tryActivate(extensionContext: vscode.ExtensionContext): Promise<void> {
    if (await Experiments.instance.isExperimentEnabled('lsp')) {
        await activateDocumentsLanguageServer(extensionContext)
    }
}
