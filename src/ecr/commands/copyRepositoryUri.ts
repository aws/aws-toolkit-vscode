/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { copyUrl, Env } from '../../shared/vscode/env'
import { Window } from '../../shared/vscode/window'
import { getLogger } from '../../shared/logger'
import { EcrRepositoryNode } from '../explorer/ecrRepositoryNode'
import { recordEcrCopyRepositoryUri } from '../../shared/telemetry/telemetry'

export async function copyRepositoryUri(
    node: EcrRepositoryNode,
    window = Window.vscode(),
    env = Env.vscode()
): Promise<void> {
    getLogger().debug('copyRepositoryUri called for %O', node)
    const uri = node.repository.repositoryUri
    copyUrl(window, env, uri, () => {
        recordEcrCopyRepositoryUri()
    })
}
