/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger'
import { Env } from '../../shared/vscode/env'
import { Window } from '../../shared/vscode/window'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { addCodiconToString } from '../../shared/utilities/textUtilities'
import { IotNode } from '../explorer/iotNodes'

const COPY_PATH_DISPLAY_TIMEOUT_MS = 2000

/**
 * Copies the path to the folder or file represented by the given node.
 *
 * Note that the path does not contain the bucket name or a leading slash.
 */
export async function copyEndpointCommand(node: IotNode, window = Window.vscode(), env = Env.vscode()): Promise<void> {
    getLogger().debug('CopyPath called for %O', node)

    let endpoint: string
    try {
        endpoint = await node.getEndpoint()
    } catch (e) {
        getLogger().error('Failed to retrieve endpoint: %O', e)
        return
    }

    await env.clipboard.writeText(endpoint)

    getLogger().info(`Copied path ${endpoint} to clipboard`)

    window.setStatusBarMessage(
        addCodiconToString(
            'clippy',
            localize('AWS.explorerNode.copiedToClipboard', 'Copied {0} to clipboard', 'endpoint')
        ),
        COPY_PATH_DISPLAY_TIMEOUT_MS
    )
}
