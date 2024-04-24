/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolkitError } from '../shared/errors'
import { featureName } from './constants'
import { uploadCodeError } from './userFacingText'

export class ConversationIdNotFoundError extends ToolkitError {
    constructor() {
        super('Conversation id must exist before starting code generation', { code: 'ConversationIdNotFound' })
    }
}

export class TabIdNotFoundError extends ToolkitError {
    constructor(query: string) {
        super(`Tab id was not found from ${query}`, { code: 'TabIdNotFound' })
    }
}

export class PanelLoadError extends ToolkitError {
    constructor() {
        super(`${featureName} UI panel failed to load`, { code: 'PanelLoadFailed' })
    }
}

export class WorkspaceFolderNotFoundError extends ToolkitError {
    constructor() {
        super(`Workspace folder was not found. Open a workspace to continue using ${featureName}`, {
            code: 'WorkspaceFolderNotFound',
        })
    }
}

export class UserMessageNotFoundError extends ToolkitError {
    constructor() {
        super(`Message was not found`, { code: 'MessageNotFound' })
    }
}

export class SelectedFolderNotInWorkspaceFolderError extends ToolkitError {
    constructor() {
        super(
            `The selected folder is not in an opened workspace folder. Add the selected folder to the workspace or pick a new folder`,
            {
                code: 'SelectedFolderNotInWorkspaceFolder',
            }
        )
    }
}

export class PrepareRepoFailedError extends ToolkitError {
    constructor() {
        super('Unable to prepare repository for uploading', { code: 'PrepareRepoFailed' })
    }
}

export class UploadCodeError extends ToolkitError {
    constructor(statusCode: string) {
        super(uploadCodeError, { code: `UploadCode-${statusCode}` })
    }
}

export class IllegalStateTransition extends ToolkitError {
    constructor() {
        super('Illegal transition between states, restart the conversation', { code: 'IllegalStateTransition' })
    }
}

export class ContentLengthError extends ToolkitError {
    constructor() {
        super(
            'The project you have selected for source code is too large to use as context. Please select a different folder to use for this conversation',
            { code: 'ContentLengthError' }
        )
    }
}

export class PlanIterationLimitError extends ToolkitError {
    constructor() {
        super(
            'You have reached the free tier limit for number of iterations on an implementation plan. Please proceed to generating code or start to discuss a new plan.',
            { code: 'PlanIterationLimitError' }
        )
    }
}

export class CodeIterationLimitError extends ToolkitError {
    constructor() {
        super(
            'You have reached the free tier limit for number of iterations on a code generation. Please proceed to accept the code or start a new conversation.',
            { code: 'CodeIterationLimitError' }
        )
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

const denyListedErrors: string[] = ['Deserialization error', 'Inaccessible host']

export function createUserFacingErrorMessage(message: string) {
    if (denyListedErrors.some(err => message.includes(err))) {
        return `${featureName} API request failed`
    }
    return message
}
