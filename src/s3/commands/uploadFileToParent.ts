/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger'
import { S3FileNode } from '../explorer/s3FileNode'
import { uploadFileCommand } from './uploadFile'

/**
 * Uploads a file to the parent bucket or folder.
 */
export async function uploadFileToParentCommand(node: S3FileNode): Promise<void> {
    getLogger().debug('UploadFileToParent called for %O', node)
    return uploadFileCommand(node.parent)
}
