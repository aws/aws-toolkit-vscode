/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ToolkitError } from '../shared/errors'

export const technicalErrorCustomerFacingMessage =
    'I am experiencing technical difficulties at the moment. Please try again in a few minutes.'
const defaultTestGenErrorMessage = 'Amazon Q encountered an error while generating tests. Try again later.'
export class TestGenError extends ToolkitError {
    constructor(
        error: string,
        code: string,
        public uiMessage: string
    ) {
        super(error, { code })
    }
}
export class ProjectZipError extends TestGenError {
    constructor(error: string) {
        super(error, 'ProjectZipError', defaultTestGenErrorMessage)
    }
}
export class InvalidSourceZipError extends TestGenError {
    constructor() {
        super('Failed to create valid source zip', 'InvalidSourceZipError', defaultTestGenErrorMessage)
    }
}
export class CreateUploadUrlError extends TestGenError {
    constructor(errorMessage: string) {
        super(errorMessage, 'CreateUploadUrlError', technicalErrorCustomerFacingMessage)
    }
}
export class UploadTestArtifactToS3Error extends TestGenError {
    constructor(error: string) {
        super(error, 'UploadTestArtifactToS3Error', technicalErrorCustomerFacingMessage)
    }
}
export class CreateTestJobError extends TestGenError {
    constructor(error: string) {
        super(error, 'CreateTestJobError', technicalErrorCustomerFacingMessage)
    }
}
export class TestGenTimedOutError extends TestGenError {
    constructor() {
        super(
            'Test generation failed. Amazon Q timed out.',
            'TestGenTimedOutError',
            technicalErrorCustomerFacingMessage
        )
    }
}
export class TestGenStoppedError extends TestGenError {
    constructor() {
        super('Unit test generation cancelled.', 'TestGenCancelled', 'Unit test generation cancelled.')
    }
}
export class TestGenFailedError extends TestGenError {
    constructor(error?: string) {
        super(error ?? 'Test generation failed', 'TestGenFailedError', error ?? technicalErrorCustomerFacingMessage)
    }
}
export class ExportResultsArchiveError extends TestGenError {
    constructor(error?: string) {
        super(error ?? 'Test generation failed', 'ExportResultsArchiveError', technicalErrorCustomerFacingMessage)
    }
}
