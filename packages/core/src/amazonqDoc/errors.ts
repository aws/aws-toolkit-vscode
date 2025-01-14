/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolkitError } from '../shared/errors'
import { i18n } from '../shared/i18n-helper'

export class DocServiceError extends ToolkitError {
    constructor(message: string, code: string) {
        super(message, { code })
    }
}

export class ReadmeTooLargeError extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.doc.error.readmeTooLarge'), {
            code: ReadmeTooLargeError.name,
        })
    }
}

export class ReadmeUpdateTooLargeError extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.doc.error.readmeUpdateTooLarge'), {
            code: ReadmeUpdateTooLargeError.name,
        })
    }
}

export class WorkspaceEmptyError extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.doc.error.workspaceEmpty'), {
            code: WorkspaceEmptyError.name,
        })
    }
}

export class NoChangeRequiredException extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.doc.error.noChangeRequiredException'), {
            code: NoChangeRequiredException.name,
        })
    }
}

export class PromptRefusalException extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.doc.error.promptRefusal'), {
            code: PromptRefusalException.name,
        })
    }
}

export class ContentLengthError extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.doc.error.contentLengthError'), { code: ContentLengthError.name })
    }
}

export class PromptTooVagueError extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.doc.error.promptTooVague'), {
            code: PromptTooVagueError.name,
        })
    }
}

export class PromptUnrelatedError extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.doc.error.promptUnrelated'), {
            code: PromptUnrelatedError.name,
        })
    }
}
