/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientError, ContentLengthError as CommonContentLengthError } from '../shared/errors'
import { i18n } from '../shared/i18n-helper'

export class DocClientError extends ClientError {
    remainingIterations?: number
    constructor(message: string, code: string, remainingIterations?: number) {
        super(message, { code })
        this.remainingIterations = remainingIterations
    }
}

export class ReadmeTooLargeError extends DocClientError {
    constructor() {
        super(i18n('AWS.amazonq.doc.error.readmeTooLarge'), ReadmeTooLargeError.name)
    }
}

export class ReadmeUpdateTooLargeError extends DocClientError {
    constructor(remainingIterations: number) {
        super(i18n('AWS.amazonq.doc.error.readmeUpdateTooLarge'), ReadmeUpdateTooLargeError.name, remainingIterations)
    }
}

export class WorkspaceEmptyError extends DocClientError {
    constructor() {
        super(i18n('AWS.amazonq.doc.error.workspaceEmpty'), WorkspaceEmptyError.name)
    }
}

export class NoChangeRequiredException extends DocClientError {
    constructor() {
        super(i18n('AWS.amazonq.doc.error.noChangeRequiredException'), NoChangeRequiredException.name)
    }
}

export class PromptRefusalException extends DocClientError {
    constructor(remainingIterations: number) {
        super(i18n('AWS.amazonq.doc.error.promptRefusal'), PromptRefusalException.name, remainingIterations)
    }
}

export class ContentLengthError extends CommonContentLengthError {
    constructor() {
        super(i18n('AWS.amazonq.doc.error.contentLengthError'), { code: ContentLengthError.name })
    }
}

export class PromptTooVagueError extends DocClientError {
    constructor(remainingIterations: number) {
        super(i18n('AWS.amazonq.doc.error.promptTooVague'), PromptTooVagueError.name, remainingIterations)
    }
}

export class PromptUnrelatedError extends DocClientError {
    constructor(remainingIterations: number) {
        super(i18n('AWS.amazonq.doc.error.promptUnrelated'), PromptUnrelatedError.name, remainingIterations)
    }
}
