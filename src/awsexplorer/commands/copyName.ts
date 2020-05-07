/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DefaultEnv, Env } from '../../shared/vscode/env'
import { DefaultWindow, Window } from '../../shared/vscode/window'
import { getLogger } from '../../shared/logger'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { localize } from '../../shared/utilities/vsCodeUtils'

/**
 * Copies the name of the resource represented by the given node.
 */
export async function copyNameCommand(
    node: AWSResourceNode,
    window: Window = new DefaultWindow(),
    env: Env = new DefaultEnv()
): Promise<void> {
    getLogger().debug(`CopyName called for ${node}`)
    await env.clipboard.writeText(node.name)
    recordCopyName()

    window.setStatusBarMessage(localize('AWS.explorerNode.copiedName', 'Copied name to clipboard'))
}

// TODO add telemetry for copy name
function recordCopyName(): void {}
