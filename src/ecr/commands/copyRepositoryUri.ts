/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env } from '../../shared/vscode/env'
import { copyToClipboard } from '../../shared/utilities/messages'
import { EcrRepositoryNode } from '../explorer/ecrRepositoryNode'
import { telemetry } from '../../shared/telemetry/telemetry'

export async function copyRepositoryUri(node: EcrRepositoryNode, env = Env.vscode()): Promise<void> {
    const uri = node.repository.repositoryUri
    await copyToClipboard(uri, 'URI', env)
    telemetry.ecr_copyRepositoryUri.emit()
}
