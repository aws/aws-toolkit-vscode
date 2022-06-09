/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EcrTagNode } from '../explorer/ecrTagNode'
import { recordEcrCopyTagUri } from '../../shared/telemetry/telemetry'
import { copyUrl, Env } from '../../shared/vscode/env'
import { Window } from '../../shared/vscode/window'
import { getLogger } from '../../shared/logger'

export async function copyTagUri(node: EcrTagNode, window = Window.vscode(), env = Env.vscode()): Promise<void> {
    getLogger().debug('copyTagUri called for %O', node)
    const uri = `${node.repository.repositoryUri}:${node.tag}`
    copyUrl(window, env, uri, () => {
        recordEcrCopyTagUri()
    })
}
