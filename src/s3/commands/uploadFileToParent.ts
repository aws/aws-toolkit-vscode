/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { S3FileNode } from '../explorer/s3FileNode'

/**
 * Uploads a file to the parent bucket or folder.
 */
export async function uploadFileToParentCommand(node: S3FileNode): Promise<void> {
    getLogger().debug('UploadFileToParent called for %O', node)
    return vscode.commands.executeCommand('aws.s3.uploadFile', [node.parent])
}
