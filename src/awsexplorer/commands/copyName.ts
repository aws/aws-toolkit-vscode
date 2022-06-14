/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env } from '../../shared/vscode/env'
import { copyToClipboard } from '../../shared/utilities/messages'
import { Window } from '../../shared/vscode/window'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'

/**
 * Copies the name of the resource represented by the given node.
 */
export async function copyNameCommand(
    node: AWSResourceNode,
    window = Window.vscode(),
    env = Env.vscode()
): Promise<void> {
    copyToClipboard(node.name, 'name', window, env)
    recordCopyName()
}

// TODO add telemetry for copy name
function recordCopyName(): void {}
