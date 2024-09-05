/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolkitError } from '../shared/errors'
import { featureName } from './constants'
import { uploadCodeError } from './userFacingText'
import { i18n } from '../shared/i18n-helper'

/**
 * Error thrown when the conversation ID is not found.
 * @extends ToolkitError
 */
export class ConversationIdNotFoundError extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.conversationIdNotFoundError'), {
            code: 'ConversationIdNotFound',
        })
    }
}

/**
 * Error thrown when the tab ID is not found.
 * @extends ToolkitError
 */
export class TabIdNotFoundError extends ToolkitError {
    static errorName = 'TabIdNotFoundError'

    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.tabIdNotFoundError'), {
            code: 'TabIdNotFound',
        })
    }
}

/**
 * Error thrown when the UI panel fails to load.
 * @extends ToolkitError
 */
export class PanelLoadError extends ToolkitError {
    constructor() {
        super(`${featureName} UI panel failed to load`, { code: 'PanelLoadFailed' })
    }
}

/**
 * Error thrown when the workspace folder is not found.
 * @extends ToolkitError
 */
export class WorkspaceFolderNotFoundError extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.workspaceFolderNotFoundError'), {
            code: 'WorkspaceFolderNotFound',
        })
    }
}

/**
 * Error thrown when the user message is not found.
 * @extends ToolkitError
 */
export class UserMessageNotFoundError extends ToolkitError {
    static errorName = 'UserMessageNotFoundError'
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.userMessageNotFoundError'), {
            code: 'MessageNotFound',
        })
    }
}

/**
 * Error thrown when the selected folder is not in the workspace folder.
 * @extends ToolkitError
 */
export class SelectedFolderNotInWorkspaceFolderError extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.selectedFolderNotInWorkspaceFolderError'), {
            code: 'SelectedFolderNotInWorkspaceFolder',
        })
    }
}

/**
 * Error thrown when a prompt is refused.
 * @extends ToolkitError
 */
export class PromptRefusalException extends ToolkitError {
    static errorName = 'PromptRefusalException'
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.promptRefusalException'), {
            code: 'PromptRefusalException',
        })
    }
}

/**
 * Error thrown when there's an issue with the Feature Development service.
 * @extends ToolkitError
 */
export class FeatureDevServiceError extends ToolkitError {
    static errorName = 'FeatureDevServiceError'
    constructor(message: string, code: string) {
        super(message, { code })
    }
}

/**
 * Error thrown when preparing the repository fails.
 * @extends ToolkitError
 */
export class PrepareRepoFailedError extends ToolkitError {
    static errorName = 'PrepareRepoFailedError'
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.prepareRepoFailedError'), {
            code: 'PrepareRepoFailed',
        })
    }
}

/**
 * Error thrown when uploading code fails.
 * @extends ToolkitError
 */
export class UploadCodeError extends ToolkitError {
    static errorName = 'UploadCodeError'
    constructor(statusCode: string) {
        super(uploadCodeError, { code: `UploadCode-${statusCode}` })
    }
}

/**
 * Error thrown when an illegal state transition occurs.
 * @extends ToolkitError
 */
export class IllegalStateTransition extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.illegalStateTransition'), { code: 'IllegalStateTransition' })
    }
}

/**
 * Error thrown when there's an issue with the content length.
 * @extends ToolkitError
 */
export class ContentLengthError extends ToolkitError {
    static errorName = 'ContentLengthError'
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.contentLengthError'), { code: ContentLengthError.errorName })
    }
}

/**
 * Error thrown when there's an issue with a zip file.
 * @extends ToolkitError
 */
export class ZipFileError extends ToolkitError {
    static errorName = 'ZipFileError'
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.zipFileError'), { code: ZipFileError.errorName })
    }
}

/**
 * Error thrown when the plan iteration limit is reached.
 * @extends ToolkitError
 */
export class PlanIterationLimitError extends ToolkitError {
    static errorName = 'PlanIterationLimitError'
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.planIterationLimitError'), { code: PlanIterationLimitError.errorName })
    }
}

/**
 * Error thrown when the code iteration limit is reached.
 * @extends ToolkitError
 */
export class CodeIterationLimitError extends ToolkitError {
    static errorName = 'CodeIterationLimitError'
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.codeIterationLimitError'), { code: CodeIterationLimitError.errorName })
    }
}

/**
 * Error thrown when the monthly conversation limit is reached.
 * @extends ToolkitError
 */
export class MonthlyConversationLimitError extends ToolkitError {
    static errorName = 'MonthlyConversationLimitError'
    constructor(message: string) {
        super(message, { code: MonthlyConversationLimitError.errorName })
    }
}

/**
 * Error thrown when an unknown API error occurs.
 * @extends ToolkitError
 */
export class UnknownApiError extends ToolkitError {
    constructor(message: string, api: string) {
        super(message, { code: `${api}-Unknown` })
    }
}

/**
 * Error thrown when an API error occurs.
 * @extends ToolkitError
 */
export class ApiError extends ToolkitError {
    constructor(message: string, api: string, errorName: string, errorCode: number) {
        super(message, { code: `${api}-${errorName}-${errorCode}` })
    }
}

export const denyListedErrors: string[] = ['Deserialization error', 'Inaccessible host']

/**
 * Creates a user-facing error message.
 * @param {string} message - The error message to be formatted.
 * @returns {string} The formatted user-facing error message.
 */
export function createUserFacingErrorMessage(message: string) {
    if (denyListedErrors.some((err) => message.includes(err))) {
        return `${featureName} API request failed`
    }
    return message
}
