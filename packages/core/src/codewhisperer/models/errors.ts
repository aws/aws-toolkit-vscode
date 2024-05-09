/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolkitError } from '../../shared/errors'
import {
    DefaultCodeScanErrorMessage,
    FileSizeExceededErrorMessage,
    NoWorkspaceFoundErrorMessage,
    ProjectSizeExceededErrorMessage,
    InvalidSourceFilesErrorMessage,
    UploadArtifactToS3ErrorMessage,
} from './constants'

export enum ErrorCodes {
    FileSizeExceeded = 'FileSizeExceeded',
    ProjectSizeExceeded = 'ProjectSizeExceeded',
    NoWorkspaceFound = 'NoWorkspaceFound',
    InvalidSourceFiles = 'InvalidSourceFiles',
    CreateUploadUrlError = 'CreateUploadUrlError',
    UploadArtifactToS3Error = 'UploadArtifactToS3Error',
    DefaultError = 'DefaultError',
    InvalidSourceZip = 'InvalidSourceZip',
    CreateCodeScanError = 'CreateCodeScanError',
    CreateCodeScanFailedError = 'CreateCodeScanFailedError',
    SecurityScanTimedOutError = 'SecurityScanTimedOutError',
    CodeScanJobFailedError = 'CodeScanJobFailedError',
}

export const mapErrorToCustomerFacingMessage: Record<ErrorCodes, string> = {
    FileSizeExceeded: FileSizeExceededErrorMessage,
    ProjectSizeExceeded: ProjectSizeExceededErrorMessage,
    NoWorkspaceFound: NoWorkspaceFoundErrorMessage,
    InvalidSourceFiles: InvalidSourceFilesErrorMessage,
    CreateUploadUrlError: DefaultCodeScanErrorMessage,
    UploadArtifactToS3Error: UploadArtifactToS3ErrorMessage,
    DefaultError: DefaultCodeScanErrorMessage,
    InvalidSourceZip: DefaultCodeScanErrorMessage,
    CreateCodeScanError: DefaultCodeScanErrorMessage,
    CreateCodeScanFailedError: DefaultCodeScanErrorMessage,
    SecurityScanTimedOutError: DefaultCodeScanErrorMessage,
    CodeScanJobFailedError: DefaultCodeScanErrorMessage,
}

export class FileSizeExceededError extends ToolkitError {
    constructor() {
        super('Payload size limit reached', {
            code: ErrorCodes.FileSizeExceeded,
        })
    }
}

export class ProjectSizeExceededError extends ToolkitError {
    constructor() {
        super('Payload size limit reached', { code: ErrorCodes.ProjectSizeExceeded })
    }
}

export class DefaultError extends ToolkitError {
    constructor() {
        super('Security scan failed.', { code: ErrorCodes.DefaultError })
    }
}

export class InvalidSourceZipError extends ToolkitError {
    constructor() {
        super('Failed to create valid source zip', { code: ErrorCodes.InvalidSourceZip })
    }
}

export class NoWorkspaceFolderFoundError extends ToolkitError {
    constructor() {
        super('No workspace folders found', { code: ErrorCodes.NoWorkspaceFound })
    }
}

export class InvalidSourceFilesError extends ToolkitError {
    constructor() {
        super('Project does not contain valid files to scan', { code: ErrorCodes.InvalidSourceFiles })
    }
}

export class CreateUploadUrlError extends ToolkitError {
    constructor(error: string) {
        super(error, { code: ErrorCodes.CreateUploadUrlError })
    }
}

export class UploadArtifactToS3Error extends ToolkitError {
    constructor(error: string) {
        super(error, { code: ErrorCodes.UploadArtifactToS3Error })
    }
}

export class CreateCodeScanError extends ToolkitError {
    constructor(error: string) {
        super(error, { code: ErrorCodes.CreateCodeScanError })
    }
}

export class CreateCodeScanFailedError extends ToolkitError {
    constructor(error: string) {
        super(error, { code: ErrorCodes.CreateCodeScanFailedError })
    }
}

export class SecurityScanTimedOutError extends ToolkitError {
    constructor() {
        super('Security Scan failed. Amazon Q timed out.', { code: ErrorCodes.SecurityScanTimedOutError })
    }
}

export class CodeScanJobFailedError extends ToolkitError {
    constructor() {
        super('Security scan job failed.', { code: ErrorCodes.CodeScanJobFailedError })
    }
}
