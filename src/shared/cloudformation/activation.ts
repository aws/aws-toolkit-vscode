/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { DefaultTemplateRegistry, getTemplateRegistry, setTemplateRegistry } from './templateRegistry'

export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    setTemplateRegistry(new DefaultTemplateRegistry())
    await getTemplateRegistry().populateRegistry()
}
