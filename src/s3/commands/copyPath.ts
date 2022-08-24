/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env } from '../../shared/vscode/env'
import { copyToClipboard } from '../../shared/utilities/messages'
import { Window } from '../../shared/vscode/window'
import { S3FolderNode } from '../explorer/s3FolderNode'
import { S3FileNode } from '../explorer/s3FileNode'
import { telemetry } from '../../shared/telemetry/spans'

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
    await telemetry.s3_copyPath.run(() => copyToClipboard(node.path, 'path', window, env))
}
