/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SafeMessageToolkitError, ToolkitError } from '../shared/errors'
import { featureName } from './constants'
import { uploadCodeError } from './userFacingText'
import { i18n } from '../shared/i18n-helper'

export class ConversationIdNotFoundError extends SafeMessageToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.conversationIdNotFoundError'), {
            code: 'ConversationIdNotFound',
        })
    }
}

export class TabIdNotFoundError extends SafeMessageToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.tabIdNotFoundError'), {
            code: 'TabIdNotFound',
        })
    }
}

export class WorkspaceFolderNotFoundError extends SafeMessageToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.workspaceFolderNotFoundError'), {
            code: 'WorkspaceFolderNotFound',
        })
    }
}

export class UserMessageNotFoundError extends SafeMessageToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.userMessageNotFoundError'), {
            code: 'MessageNotFound',
        })
    }
}

export class SelectedFolderNotInWorkspaceFolderError extends SafeMessageToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.selectedFolderNotInWorkspaceFolderError'), {
            code: 'SelectedFolderNotInWorkspaceFolder',
        })
    }
}

export class PromptRefusalException extends SafeMessageToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.promptRefusalException'), {
            code: 'PromptRefusalException',
        })
    }
}

export class NoChangeRequiredException extends SafeMessageToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.noChangeRequiredException'), {
            code: 'NoChangeRequiredException',
        })
    }
}

// To prevent potential security issues, message passed in should be predictably safe for telemetry
export class FeatureDevServiceError extends SafeMessageToolkitError {
    constructor(message: string, code: string) {
        super(message, { code })
    }
}

export class PrepareRepoFailedError extends SafeMessageToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.prepareRepoFailedError'), {
            code: 'PrepareRepoFailed',
        })
    }
}

export class UploadCodeError extends SafeMessageToolkitError {
    constructor(statusCode: string) {
        super(uploadCodeError, { code: `UploadCode-${statusCode}` })
    }
}

export class UploadURLExpired extends SafeMessageToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.uploadURLExpired'), { code: 'UploadURLExpired' })
    }
}

export class IllegalStateTransition extends SafeMessageToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.illegalStateTransition'), { code: 'IllegalStateTransition' })
    }
}

export class ContentLengthError extends SafeMessageToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.contentLengthError'), { code: ContentLengthError.name })
    }
}

export class ZipFileError extends SafeMessageToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.zipFileError'), { code: ZipFileError.name })
    }
}

export class CodeIterationLimitError extends SafeMessageToolkitError {
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
