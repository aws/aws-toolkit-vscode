/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
//  */
import { ToolkitError } from '../shared/errors'

export const techinalErrorCustomerFacingMessage =
    'I am experiencing technical difficulties at the moment. Please try again in a few minutes.'
const defaultTestGenErrorMessage = 'Amazon Q encountered an error while generating tests. Try again later.'
export class TestGenError extends ToolkitError {
    constructor(
        error: string,
        code: string,
        public statusCode: string,
        public customerFacingMessage: string
    ) {
        super(error, { code })
    }
}
export class ProjectZipError extends TestGenError {
    constructor(error: string) {
        super(error, 'ProjectZipError', '400', defaultTestGenErrorMessage)
    }
}
export class InvalidSourceZipError extends TestGenError {
    constructor() {
        super('Failed to create valid source zip', 'InvalidSourceZipError', '400', defaultTestGenErrorMessage)
    }
}
export class CreateUploadUrlError extends TestGenError {
    constructor(errorMessage: string, errorCode: string) {
        super(errorMessage, 'CreateUploadUrlError', errorCode, techinalErrorCustomerFacingMessage)
    }
}
export class UploadTestArtifactToS3Error extends TestGenError {
    constructor(error: string) {
        super(error, 'UploadTestArtifactToS3Error', '500', techinalErrorCustomerFacingMessage)
    }
}
export class CreateTestJobError extends TestGenError {
    constructor(error: string, code: string) {
        super(error, 'CreateTestJobError', code, techinalErrorCustomerFacingMessage)
    }
}
export class TestGenTimedOutError extends TestGenError {
    constructor() {
        super(
            'Test generation failed. Amazon Q timed out.',
            'TestGenTimedOutError',
            '500',
            techinalErrorCustomerFacingMessage
        )
    }
}
export class TestGenStoppedError extends TestGenError {
    constructor() {
        super('Unit test generation cancelled.', 'TestGenCancelled', '400', 'Unit test generation cancelled.')
    }
}
export class TestGenFailedError extends TestGenError {
    constructor(code: string, error?: string) {
        super(
            error ?? 'Test generation failed',
            'TestGenFailedError',
            code,
            error ?? techinalErrorCustomerFacingMessage
        )
    }
}
export class ExportResultsArchiveError extends TestGenError {
    constructor(error?: string, statusCode?: string) {
        super(
            error ?? 'Test generation failed',
            'ExportResultsArchiveError',
            statusCode ?? '400',
            techinalErrorCustomerFacingMessage
        )
    }
}
