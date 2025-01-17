/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolkitError } from '../shared/errors'
import { i18n } from '../shared/i18n-helper'

export class DocServiceError extends ToolkitError {
    remainingIterations: number
    constructor(message: string, code: string, remainingIterations: number) {
        super(message, { code })
        this.remainingIterations = remainingIterations
    }
}

export class ReadmeTooLargeError extends DocServiceError {
    constructor(remainingIterations: number) {
        super(i18n('AWS.amazonq.doc.error.readmeTooLarge'), ReadmeTooLargeError.name, remainingIterations)
    }
}

export class ReadmeUpdateTooLargeError extends DocServiceError {
    constructor(remainingIterations: number) {
        super(i18n('AWS.amazonq.doc.error.readmeUpdateTooLarge'), ReadmeUpdateTooLargeError.name, remainingIterations)
    }
}

export class WorkspaceEmptyError extends DocServiceError {
    constructor(remainingIterations: number) {
        super(i18n('AWS.amazonq.doc.error.workspaceEmpty'), WorkspaceEmptyError.name, remainingIterations)
    }
}

export class NoChangeRequiredException extends DocServiceError {
    constructor(remainingIterations: number) {
        super(
            i18n('AWS.amazonq.doc.error.noChangeRequiredException'),
            NoChangeRequiredException.name,
            remainingIterations
        )
    }
}

export class PromptRefusalException extends DocServiceError {
    constructor(remainingIterations: number) {
        super(i18n('AWS.amazonq.doc.error.promptRefusal'), PromptRefusalException.name, remainingIterations)
    }
}

export class ContentLengthError extends DocServiceError {
    constructor(remainingIterations: number) {
        super(i18n('AWS.amazonq.doc.error.contentLengthError'), ContentLengthError.name, remainingIterations)
    }
}

export class PromptTooVagueError extends DocServiceError {
    constructor(remainingIterations: number) {
        super(i18n('AWS.amazonq.doc.error.promptTooVague'), PromptTooVagueError.name, remainingIterations)
    }
}

export class PromptUnrelatedError extends DocServiceError {
    constructor(remainingIterations: number) {
        super(i18n('AWS.amazonq.doc.error.promptUnrelated'), PromptUnrelatedError.name, remainingIterations)
    }
}
