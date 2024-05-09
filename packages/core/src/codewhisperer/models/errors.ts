/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolkitError } from '../../shared/errors'

const DefaultErrorMessage = 'Amazon Q encountered an error while scanning for security issues. Try again later.'

export const mapErrorToCustomerFacingMessage: Record<string, string> = {
    FileSizeExceeded: `Amazon Q: The selected file exceeds the input artifact limit. Try again with a smaller file. For more information about scan limits, see the [Amazon Q documentation](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/security-scans.html#quotas).`,
    ProjectSizeExceeded: `Amazon Q: The selected file exceeds the input artifact limit. Try again with a smaller project. For more information about scan limits, see the [Amazon Q documentation](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/security-scans.html#quotas).`,
    NoWorkspaceFound: 'Amazon Q: No workspace folders found',
    InvalidSourceFiles: 'Amazon Q: Project does not contain valid files to scan',
    CreateUploadUrlError: DefaultErrorMessage,
    UploadArtifactToS3Error: `Amazon Q is unable to upload your workspace artifacts to Amazon S3 for security scans. For more information, see the [Amazon Q documentation](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/security_iam_manage-access-with-policies.html#data-perimeters).`,
    DefaultError: DefaultErrorMessage,
    InvalidSourceZip: DefaultErrorMessage,
    CreateCodeScanError: DefaultErrorMessage,
    CreateCodeScanFailedError: DefaultErrorMessage,
    SecurityScanTimedOutError: DefaultErrorMessage,
    CodeScanJobFailedError: DefaultErrorMessage,
}

export class FileSizeExceededError extends ToolkitError {
    constructor() {
        super('Payload size limit reached', {
            code: 'FileSizeExceeded',
        })
    }
}

export class ProjectSizeExceededError extends ToolkitError {
    constructor() {
        super('Payload size limit reached', { code: 'ProjectSizeExceeded' })
    }
}

export class DefaultError extends ToolkitError {
    constructor() {
        super('Security scan failed.', { code: 'DefaultError' })
    }
}

export class InvalidSourceZipError extends ToolkitError {
    constructor() {
        super('Failed to create valid source zip', { code: 'InvalidSourceZip' })
    }
}

export class NoWorkspaceFolderFoundError extends ToolkitError {
    constructor() {
        super('No workspace folders found', { code: 'NoWorkspaceFound' })
    }
}

export class InvalidSourceFilesError extends ToolkitError {
    constructor() {
        super('Project does not contain valid files to scan', { code: 'InvalidSourceFiles' })
    }
}

export class CreateUploadUrlError extends ToolkitError {
    constructor(error: string) {
        super(error, { code: 'CreateUploadUrlError' })
    }
}

export class UploadArtifactToS3Error extends ToolkitError {
    constructor(error: string) {
        super(error, { code: 'UploadArtifactToS3Error' })
    }
}

export class CreateCodeScanError extends ToolkitError {
    constructor(error: string) {
        super(error, { code: 'CreateCodeScanError' })
    }
}

export class CreateCodeScanFailedError extends ToolkitError {
    constructor(error: string) {
        super(error, { code: 'CreateCodeScanFailedError' })
    }
}

export class SecurityScanTimedOutError extends ToolkitError {
    constructor() {
        super('Security Scan failed. Amazon Q timed out.', { code: 'SecurityScanTimedOutError' })
    }
}

export class CodeScanJobFailedError extends ToolkitError {
    constructor() {
        super('Security scan job failed.', { code: 'CodeScanJobFailedError' })
    }
}
