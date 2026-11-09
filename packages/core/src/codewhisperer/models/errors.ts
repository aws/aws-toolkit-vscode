/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ToolkitError } from '../../shared/errors'
import { i18n } from '../../shared/i18n-helper'
import {
    DefaultCodeScanErrorMessage,
    FileSizeExceededErrorMessage,
    ProjectSizeExceededErrorMessage,
    UploadArtifactToS3ErrorMessage,
    defaultCodeFixErrorMessage,
    defaultTestGenErrorMessage,
    noActiveFileErrorMessage,
    noSourceFilesErrorMessage,
} from './constants'

export class SecurityScanError extends ToolkitError {
    constructor(
        error: string,
        code: string,
        public customerFacingMessage: string
    ) {
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
        super('Project does not contain valid files.', 'NoSourceFilesError', noSourceFilesErrorMessage)
    }
}

export class NoActiveFileError extends SecurityScanError {
    constructor() {
        super('Open valid file to run a file scan', 'NoActiveFileError', noActiveFileErrorMessage)
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
        super('Security scan failed.', 'CodeScanJobFailedError', DefaultCodeScanErrorMessage)
    }
}

export class MaximumFileScanReachedError extends SecurityScanError {
    constructor() {
        super(
            'Maximum file review count reached for this month.',
            'MaximumFileScanReachedError',
            i18n('AWS.amazonq.featureDev.error.monthlyLimitReached')
        )
    }
}

export class MaximumProjectScanReachedError extends SecurityScanError {
    constructor() {
        super(
            'Maximum project review count reached for this month',
            'MaximumProjectScanReachedError',
            i18n('AWS.amazonq.featureDev.error.monthlyLimitReached')
        )
    }
}

export class TestGenError extends ToolkitError {
    constructor(
        error: string,
        code: string,
        public customerFacingMessage: string
    ) {
        super(error, { code })
    }
}

export class TestGenTimedOutError extends TestGenError {
    constructor() {
        super('Test generation failed. Amazon Q timed out.', 'TestGenTimedOutError', defaultTestGenErrorMessage)
    }
}

export class TestGenStoppedError extends TestGenError {
    constructor() {
        super('Test generation stopped by user.', 'TestGenCancelled', defaultTestGenErrorMessage)
    }
}

export class TestGenFailedError extends TestGenError {
    constructor(error?: string) {
        super(error ?? 'Test generation failed', 'TestGenFailedError', defaultTestGenErrorMessage)
    }
}

export class CodeFixError extends ToolkitError {
    constructor(
        error: string,
        code: string,
        public customerFacingMessage: string
    ) {
        super(error, { code })
    }
}

export class CreateCodeFixError extends CodeFixError {
    constructor() {
        super('Code fix generation failed', 'CreateCodeFixFailed', defaultCodeFixErrorMessage)
    }
}

export class CodeFixJobTimedOutError extends CodeFixError {
    constructor() {
        super('Code fix generation failed. Amazon Q timed out.', 'CodeFixTimedOutError', defaultCodeFixErrorMessage)
    }
}

export class CodeFixJobStoppedError extends CodeFixError {
    constructor() {
        super('Code fix generation stopped by user.', 'CodeFixCancelled', defaultCodeFixErrorMessage)
    }
}

export class MonthlyCodeFixLimitError extends CodeFixError {
    constructor() {
        super(
            i18n('AWS.amazonq.codefix.error.monthlyLimitReached'),
            MonthlyCodeFixLimitError.name,
            defaultCodeFixErrorMessage
        )
    }
}
