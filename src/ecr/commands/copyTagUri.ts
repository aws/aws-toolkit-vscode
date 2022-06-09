/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EcrTagNode } from '../explorer/ecrTagNode'
import { recordEcrCopyTagUri } from '../../shared/telemetry/telemetry'
import { Env } from '../../shared/vscode/env'
import { copyToClipboard } from '../../shared/utilities/messages'
import { Window } from '../../shared/vscode/window'

export async function copyTagUri(node: EcrTagNode, window = Window.vscode(), env = Env.vscode()): Promise<void> {
    const uri = `${node.repository.repositoryUri}:${node.tag}`
    copyToClipboard(uri, 'URI', window, env)
    recordEcrCopyTagUri()
}
