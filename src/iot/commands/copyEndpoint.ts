/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { localize } from '../../shared/utilities/vsCodeUtils'
import { IotNode } from '../explorer/iotNodes'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { Env } from '../../shared/vscode/env'
import { copyToClipboard } from '../../shared/utilities/messages'
import { Window } from '../../shared/vscode/window'
import { getLogger } from '../../shared/logger'

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
        getLogger().error('Failed to retrieve endpoint: %s', e)
        showViewLogsMessage(localize('AWS.iot.copyEndpoint.error', 'Failed to retrieve endpoint'), window)
        return
    }

    copyToClipboard(endpoint, 'URL', window, env)
}
