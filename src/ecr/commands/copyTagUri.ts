/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env } from '../../shared/vscode/env'
import { Window } from '../../shared/vscode/window'
import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { EcrTagNode } from '../explorer/ecrTagNode'
import { recordEcrCopyTagUri } from '../../shared/telemetry/telemetry'

const COPY_PATH_DISPLAY_TIMEOUT_MS = 2000
export async function copyTagUri(node: EcrTagNode, window = Window.vscode(), env = Env.vscode()): Promise<void> {
    getLogger().debug('copyTagUri called for %O', node)

    const uri = `${node.repository.repositoryUri}:${node.tag}`

    await env.clipboard.writeText(uri)

    getLogger().info(`Copied uri to clipboard: ${uri}`)

    window.setStatusBarMessage(
        localize('AWS.explorerNode.copiedToClipboard', '$(clippy) Copied {0} to clipboard', 'URI'),
        COPY_PATH_DISPLAY_TIMEOUT_MS
    )

    recordEcrCopyTagUri()
}
