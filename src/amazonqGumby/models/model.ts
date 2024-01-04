/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolkitError } from '../../shared/errors'

export class TransformByQUploadArchiveFailed extends ToolkitError {
    constructor() {
        // do not chain the error due to security issues (may contain the uploadUrl)
        super('Failed to zip code and upload it to S3')
    }
}

export class TransformByQJavaProjectNotFound extends ToolkitError {
    constructor() {
        super('No Java projects found', { code: 'NoJavaProjectsAvailable' })
    }
}
