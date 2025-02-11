/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolkitError } from '../shared/errors'
import {
    featureName,
    clientErrorMessages,
    startCodeGenClientErrorMessages,
    startTaskAssistLimitReachedMessage,
} from './constants'
import { uploadCodeError } from './userFacingText'
import { i18n } from '../shared/i18n-helper'

export class ConversationIdNotFoundError extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.conversationIdNotFoundError'), {
            code: 'ConversationIdNotFound',
        })
    }
}

export class TabIdNotFoundError extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.tabIdNotFoundError'), {
            code: 'TabIdNotFound',
        })
    }
}

export class WorkspaceFolderNotFoundError extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.workspaceFolderNotFoundError'), {
            code: 'WorkspaceFolderNotFound',
        })
    }
}

export class UserMessageNotFoundError extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.userMessageNotFoundError'), {
            code: 'MessageNotFound',
        })
    }
}

export class SelectedFolderNotInWorkspaceFolderError extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.selectedFolderNotInWorkspaceFolderError'), {
            code: 'SelectedFolderNotInWorkspaceFolder',
        })
    }
}

export class PromptRefusalException extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.promptRefusalException'), {
            code: 'PromptRefusalException',
        })
    }
}

export class NoChangeRequiredException extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.noChangeRequiredException'), {
            code: 'NoChangeRequiredException',
        })
    }
}

export class FeatureDevServiceError extends ToolkitError {
    constructor(message: string, code: string) {
        super(message, { code })
    }
}

export class PrepareRepoFailedError extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.prepareRepoFailedError'), {
            code: 'PrepareRepoFailed',
        })
    }
}

export class UploadCodeError extends ToolkitError {
    constructor(statusCode: string) {
        super(uploadCodeError, { code: `UploadCode-${statusCode}` })
    }
}

export class UploadURLExpired extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.uploadURLExpired'), { code: 'UploadURLExpired' })
    }
}

export class IllegalStateTransition extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.illegalStateTransition'), { code: 'IllegalStateTransition' })
    }
}

export class ContentLengthError extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.contentLengthError'), { code: ContentLengthError.name })
    }
}

export class ZipFileError extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.zipFileError'), { code: ZipFileError.name })
    }
}

export class CodeIterationLimitError extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.codeIterationLimitError'), { code: CodeIterationLimitError.name })
    }
}

export class MonthlyConversationLimitError extends ToolkitError {
    constructor(message: string) {
        super(message, { code: MonthlyConversationLimitError.name })
    }
}

export class UnknownApiError extends ToolkitError {
    constructor(message: string, api: string) {
        super(message, { code: `${api}-Unknown` })
    }
}

export class ApiError extends ToolkitError {
    constructor(message: string, api: string, errorName: string, errorCode: number) {
        super(message, { code: `${api}-${errorName}-${errorCode}` })
    }
}

export const denyListedErrors: string[] = ['Deserialization error', 'Inaccessible host']

export function createUserFacingErrorMessage(message: string) {
    if (denyListedErrors.some((err) => message.includes(err))) {
        return `${featureName} API request failed`
    }
    return message
}

export function isAPIClientError(error: { code?: string; message: string }): boolean {
    return (
        (error.code === 'StartCodeGenerationFailed' &&
            startCodeGenClientErrorMessages.some((msg: string) => error.message.includes(msg))) ||
        clientErrorMessages.some((msg: string) => error.message.includes(msg)) ||
        error.message.includes(startTaskAssistLimitReachedMessage)
    )
}
