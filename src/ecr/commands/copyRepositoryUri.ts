/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env } from '../../shared/vscode/env'
import { Window } from '../../shared/vscode/window'
import { getLogger } from '../../shared/logger'
import { EcrRepositoryNode } from '../explorer/ecrRepositoryNode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { recordEcrCopyRepositoryUri } from '../../shared/telemetry/telemetry'

const COPY_PATH_DISPLAY_TIMEOUT_MS = 2000
export async function copyRepositoryUri(
    node: EcrRepositoryNode,
    window = Window.vscode(),
    env = Env.vscode()
): Promise<void> {
    getLogger().debug('copyRepositoryUri called for %O', node)

    const uri = node.repository.repositoryUri

    await env.clipboard.writeText(uri)

    getLogger().info(`Copied uri to clipboard: ${uri}`)

    window.setStatusBarMessage(
        localize('AWS.explorerNode.copiedToClipboard', '$(clippy) Copied {0} to clipboard', 'URI'),
        COPY_PATH_DISPLAY_TIMEOUT_MS
    )

    recordEcrCopyRepositoryUri()
}
