/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger'
import { copyToClipboard, Env } from '../../shared/vscode/env'
import { Window } from '../../shared/vscode/window'
import { S3FolderNode } from '../explorer/s3FolderNode'
import { S3FileNode } from '../explorer/s3FileNode'
import * as telemetry from '../../shared/telemetry/telemetry'

/**
 * Copies the path to the folder or file represented by the given node.
 *
 * Note that the path does not contain the bucket name or a leading slash.
 */
export async function copyPathCommand(
    node: S3FolderNode | S3FileNode,
    window = Window.vscode(),
    env = Env.vscode()
): Promise<void> {
    getLogger().debug('CopyPath called for %O', node)
    copyToClipboard(node.path, 'URL')
    telemetry.recordS3CopyPath
}
