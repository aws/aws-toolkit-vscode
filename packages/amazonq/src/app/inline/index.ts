/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LanguageClient } from 'vscode-languageclient'
import { activate as activateInlineCompletion } from './activation'

export async function activate(languageClient: LanguageClient) {
    await activateInlineCompletion(languageClient)
}
