/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env } from '../../shared/vscode/env'
import { copyToClipboard } from '../../shared/utilities/messages'
import { Window } from '../../shared/vscode/window'
import { EcrRepositoryNode } from '../explorer/ecrRepositoryNode'
import { telemetry } from '../../shared/telemetry/telemetry'

export async function copyRepositoryUri(
    node: EcrRepositoryNode,
    window = Window.vscode(),
    env = Env.vscode()
): Promise<void> {
    const uri = node.repository.repositoryUri
    copyToClipboard(uri, 'URI', window, env)
    telemetry.ecr_copyRepositoryUri.emit()
}
