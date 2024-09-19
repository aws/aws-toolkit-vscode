/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolkitError } from '../shared/errors'
import { featureName } from './constants'
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
    static errorName = 'TabIdNotFoundError'

    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.tabIdNotFoundError'), {
            code: 'TabIdNotFound',
        })
    }
}

export class PanelLoadError extends ToolkitError {
    constructor() {
        super(`${featureName} UI panel failed to load`, { code: 'PanelLoadFailed' })
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
    static errorName = 'UserMessageNotFoundError'
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
    static errorName = 'PromptRefusalException'
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.promptRefusalException'), {
            code: 'PromptRefusalException',
        })
    }
}

export class FeatureDevServiceError extends ToolkitError {
    static errorName = 'FeatureDevServiceError'
    constructor(message: string, code: string) {
        super(message, { code })
    }
}

export class PrepareRepoFailedError extends ToolkitError {
    static errorName = 'PrepareRepoFailedError'
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.prepareRepoFailedError'), {
            code: 'PrepareRepoFailed',
        })
    }
}

export class UploadCodeError extends ToolkitError {
    static errorName = 'UploadCodeError'
    constructor(statusCode: string) {
        super(uploadCodeError, { code: `UploadCode-${statusCode}` })
    }
}

export class IllegalStateTransition extends ToolkitError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.illegalStateTransition'), { code: 'IllegalStateTransition' })
    }
}

export class ContentLengthError extends ToolkitError {
    static errorName = 'ContentLengthError'
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.contentLengthError'), { code: ContentLengthError.errorName })
    }
}

export class ZipFileError extends ToolkitError {
    static errorName = 'ZipFileError'
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.zipFileError'), { code: ZipFileError.errorName })
    }
}

export class CodeIterationLimitError extends ToolkitError {
    static errorName = 'CodeIterationLimitError'
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.codeIterationLimitError'), { code: CodeIterationLimitError.errorName })
    }
}

export class MonthlyConversationLimitError extends ToolkitError {
    static errorName = 'MonthlyConversationLimitError'
    constructor(message: string) {
        super(message, { code: MonthlyConversationLimitError.errorName })
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
