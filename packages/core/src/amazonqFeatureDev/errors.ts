/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { featureName, clientErrorMessages, startTaskAssistLimitReachedMessage } from './constants'
import { uploadCodeError } from './userFacingText'
import { i18n } from '../shared/i18n-helper'
import { LlmError } from '../amazonq/errors'
import { MetricDataResult } from '../amazonq/commons/types'
import {
    ClientError,
    ServiceError,
    ContentLengthError as CommonContentLengthError,
    ToolkitError,
} from '../shared/errors'

export class ConversationIdNotFoundError extends ServiceError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.conversationIdNotFoundError'), {
            code: 'ConversationIdNotFound',
        })
    }
}

export class TabIdNotFoundError extends ServiceError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.tabIdNotFoundError'), {
            code: 'TabIdNotFound',
        })
    }
}

export class WorkspaceFolderNotFoundError extends ServiceError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.workspaceFolderNotFoundError'), {
            code: 'WorkspaceFolderNotFound',
        })
    }
}

export class UserMessageNotFoundError extends ServiceError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.userMessageNotFoundError'), {
            code: 'MessageNotFound',
        })
    }
}

export class SelectedFolderNotInWorkspaceFolderError extends ClientError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.selectedFolderNotInWorkspaceFolderError'), {
            code: 'SelectedFolderNotInWorkspaceFolder',
        })
    }
}

export class PromptRefusalException extends ClientError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.promptRefusalException'), {
            code: 'PromptRefusalException',
        })
    }
}

export class NoChangeRequiredException extends ClientError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.noChangeRequiredException'), {
            code: 'NoChangeRequiredException',
        })
    }
}

export class FeatureDevServiceError extends ServiceError {
    constructor(message: string, code: string) {
        super(message, { code })
    }
}

export class PrepareRepoFailedError extends ServiceError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.prepareRepoFailedError'), {
            code: 'PrepareRepoFailed',
        })
    }
}

export class UploadCodeError extends ServiceError {
    constructor(statusCode: string) {
        super(uploadCodeError, { code: `UploadCode-${statusCode}` })
    }
}

export class UploadURLExpired extends ClientError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.uploadURLExpired'), { code: 'UploadURLExpired' })
    }
}

export class IllegalStateTransition extends ServiceError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.illegalStateTransition'), { code: 'IllegalStateTransition' })
    }
}

export class IllegalStateError extends ServiceError {
    constructor(message: string) {
        super(message, { code: 'IllegalStateTransition' })
    }
}

export class ContentLengthError extends CommonContentLengthError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.contentLengthError'), { code: ContentLengthError.name })
    }
}

export class ZipFileError extends ServiceError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.zipFileError'), { code: ZipFileError.name })
    }
}

export class CodeIterationLimitError extends ClientError {
    constructor() {
        super(i18n('AWS.amazonq.featureDev.error.codeIterationLimitError'), { code: CodeIterationLimitError.name })
    }
}

export class MonthlyConversationLimitError extends ClientError {
    constructor(message: string) {
        super(message, { code: MonthlyConversationLimitError.name })
    }
}

export class UnknownApiError extends ServiceError {
    constructor(message: string, api: string) {
        super(message, { code: `${api}-Unknown` })
    }
}

export class ApiClientError extends ClientError {
    constructor(message: string, api: string, errorName: string, errorCode: number) {
        super(message, { code: `${api}-${errorName}-${errorCode}` })
    }
}

export class ApiServiceError extends ServiceError {
    constructor(message: string, api: string, errorName: string, errorCode: number) {
        super(message, { code: `${api}-${errorName}-${errorCode}` })
    }
}

export class ApiError {
    static of(message: string, api: string, errorName: string, errorCode: number) {
        if (errorCode >= 400 && errorCode < 500) {
            return new ApiClientError(message, api, errorName, errorCode)
        }
        return new ApiServiceError(message, api, errorName, errorCode)
    }
}

export const denyListedErrors: string[] = ['Deserialization error', 'Inaccessible host']

export function createUserFacingErrorMessage(message: string) {
    if (denyListedErrors.some((err) => message.includes(err))) {
        return `${featureName} API request failed`
    }
    return message
}

function isAPIClientError(error: { code?: string; message: string }): boolean {
    return (
        clientErrorMessages.some((msg: string) => error.message.includes(msg)) ||
        error.message.includes(startTaskAssistLimitReachedMessage)
    )
}

export function getMetricResult(error: ToolkitError): MetricDataResult {
    if (error instanceof ClientError || isAPIClientError(error)) {
        return MetricDataResult.Error
    }
    if (error instanceof ServiceError) {
        return MetricDataResult.Fault
    }
    if (error instanceof LlmError) {
        return MetricDataResult.LlmFailure
    }

    return MetricDataResult.Fault
}
