/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Commands } from '../shared/vscode/commands2'

export const showTransformationHub = Commands.declare(
    { id: 'aws.amazonq.showTransformationHub', compositeKey: { 0: 'source' } },
    () => async (source: string) => {
        await vscode.commands.executeCommand('workbench.view.extension.aws-codewhisperer-transformation-hub')
    }
)
