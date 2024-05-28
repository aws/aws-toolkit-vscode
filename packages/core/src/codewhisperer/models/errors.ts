/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ToolkitError } from '../../shared/errors'
import {
    DefaultCodeScanErrorMessage,
    FileSizeExceededErrorMessage,
    ProjectSizeExceededErrorMessage,
    UploadArtifactToS3ErrorMessage,
    noSourceFilesErrorMessage,
} from './constants'

export class SecurityScanError extends ToolkitError {
    constructor(error: string, code: string, public customerFacingMessage: string) {
        super(error, { code })
    }
}

export class FileSizeExceededError extends SecurityScanError {
    constructor() {
        super('Payload size limit reached', 'FileSizeExceeded', FileSizeExceededErrorMessage)
    }
}

export class ProjectSizeExceededError extends SecurityScanError {
    constructor() {
        super('Payload size limit reached', 'ProjectSizeExceeded', ProjectSizeExceededErrorMessage)
    }
}

export class DefaultError extends SecurityScanError {
    constructor() {
        super('Security scan failed.', 'DefaultError', DefaultCodeScanErrorMessage)
    }
}

export class InvalidSourceZipError extends SecurityScanError {
    constructor() {
        super('Failed to create valid source zip', 'InvalidSourceZip', DefaultCodeScanErrorMessage)
    }
}

export class NoSourceFilesError extends SecurityScanError {
    constructor() {
        super('Project does not contain valid files to scan', 'NoSourceFilesError', noSourceFilesErrorMessage)
    }
}

export class CreateUploadUrlError extends SecurityScanError {
    constructor(error: string) {
        super(error, 'CreateUploadUrlError', DefaultCodeScanErrorMessage)
    }
}

export class UploadArtifactToS3Error extends SecurityScanError {
    constructor(error: string) {
        super(error, 'UploadArtifactToS3Error', UploadArtifactToS3ErrorMessage)
    }
}

export class CreateCodeScanError extends SecurityScanError {
    constructor(error: string) {
        super(error, 'CreateCodeScanError', DefaultCodeScanErrorMessage)
    }
}

export class CreateCodeScanFailedError extends SecurityScanError {
    constructor(error: string) {
        super(error, 'CreateCodeScanFailedError', DefaultCodeScanErrorMessage)
    }
}

export class SecurityScanTimedOutError extends SecurityScanError {
    constructor() {
        super('Security Scan failed. Amazon Q timed out.', 'SecurityScanTimedOutError', DefaultCodeScanErrorMessage)
    }
}

export class CodeScanJobFailedError extends SecurityScanError {
    constructor() {
        super('Security scan job failed.', 'CodeScanJobFailedError', DefaultCodeScanErrorMessage)
    }
}
