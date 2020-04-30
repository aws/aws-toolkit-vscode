/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'

const COPY_ARN_DISPLAY_TIMEOUT_MS = 2000

export async function copyArnCommand(node: AWSResourceNode) {
    try {
        await vscode.env.clipboard.writeText(node.getArn())
        vscode.window.setStatusBarMessage(
            localize('AWS.explorerNode.copiedArn', 'Copied ARN to clipboard'),
            COPY_ARN_DISPLAY_TIMEOUT_MS
        )
    } catch {
        vscode.window.showErrorMessage(
            localize('AWS.explorerNode.noArnFound', 'Could not find an ARN for selected AWS Explorer node')
        )
    }
}
