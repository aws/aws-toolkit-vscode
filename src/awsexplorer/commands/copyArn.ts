/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import { getLogger } from '../../shared/logger'
const localize = nls.loadMessageBundle()

import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { Env, DefaultEnv } from '../../shared/vscode/env'
import { Window, DefaultWindow } from '../../shared/vscode/window'

const COPY_ARN_DISPLAY_TIMEOUT_MS = 2000

/**
 * Copies the arn of the resource represented by the given node.
 */
export async function copyArnCommand(
    node: AWSResourceNode,
    window: Window = new DefaultWindow(),
    env: Env = new DefaultEnv()
): Promise<void> {
    try {
        getLogger().debug(`CopyArn called for ${node}`)
        await env.clipboard.writeText(node.arn)
        recordCopyArn()

        window.setStatusBarMessage(
            localize('AWS.explorerNode.copiedArn', 'Copied ARN to clipboard'),
            COPY_ARN_DISPLAY_TIMEOUT_MS
        )
    } catch {
        window.showErrorMessage(
            localize('AWS.explorerNode.noArnFound', 'Could not find an ARN for selected AWS Explorer node')
        )
    }
}

// TODO add telemetry for copy arn
function recordCopyArn(): void {}
