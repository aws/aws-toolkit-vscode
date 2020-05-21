/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LogGroupNode } from '../explorer/logGroupNode'

export async function selectLogStream(node: LogGroupNode): Promise<void> {
    vscode.window.showInformationMessage('Not implemented')
}
