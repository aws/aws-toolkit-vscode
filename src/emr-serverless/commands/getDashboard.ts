/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { EmrServerlessJobNode } from '../explorer/emrServerlessJobNode'
import { Commands } from '../../shared/vscode/commands'
import { openUrl } from '../../shared/utilities/vsCodeUtils'

export async function getDashboard(node: EmrServerlessJobNode, commands = Commands.vscode()): Promise<void> {
    getLogger().debug('GetDashboard called for %O', node)

    const vscodeUri = vscode.Uri.parse(await node.getDashboard())
    openUrl(vscodeUri)
    // telemetry.emrserverless_getDashboard.emit()
}
