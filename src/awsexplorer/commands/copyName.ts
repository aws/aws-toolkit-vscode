/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env } from '../../shared/vscode/env'
import { Window } from '../../shared/vscode/window'
import { getLogger } from '../../shared/logger'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { COPY_TO_CLIPBOARD_INFO_TIMEOUT_MS } from '../../shared/constants'
import { addCodiconToString } from '../../shared/utilities/textUtilities'

/**
 * Copies the name of the resource represented by the given node.
 */
export async function copyNameCommand(
    node: AWSResourceNode,
    window = Window.vscode(),
    env = Env.vscode()
): Promise<void> {
    getLogger().debug('CopyName called for %O', node)
    await env.clipboard.writeText(node.name)
    getLogger().info(`Copied name ${node.name} to clipboard`)
    recordCopyName()

    window.setStatusBarMessage(
        addCodiconToString(
            'clippy',
            localize(
                'AWS.explorerNode.copiedToClipboard',
                'Copied {0} to clipboard',
                localize('AWS.generic.name', 'name')
            )
        ),
        COPY_TO_CLIPBOARD_INFO_TIMEOUT_MS
    )
}

// TODO add telemetry for copy name
function recordCopyName(): void {}
