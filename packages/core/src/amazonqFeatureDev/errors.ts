/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolkitError } from '../shared/errors'
import { featureName } from './constants'
import { uploadCodeError } from './userFacingText'

export const CodeGenerationDefaultError = "I'm sorry, I'm having trouble generating your code."

export class ConversationIdNotFoundError extends ToolkitError {
    constructor() {
        super('Conversation id must exist before starting code generation', { code: 'ConversationIdNotFound' })
    }
}

export class TabIdNotFoundError extends ToolkitError {
    static errorName = 'TabIdNotFoundError'

    constructor() {
        super(`I'm sorry, I'm having technical difficulties at the moment. Please try again.`, {
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
        super(
            `I couldn't find a workspace folder. Open a workspace, and then open a new chat tab and enter /dev to start discussing your code task with me.`,
            {
                code: 'WorkspaceFolderNotFound',
            }
        )
    }
}

export class UserMessageNotFoundError extends ToolkitError {
    static errorName = 'UserMessageNotFoundError'
    constructor() {
        super(`It looks like you didn't provide an input. Please enter your message in the text bar.`, {
            code: 'MessageNotFound',
        })
    }
}

export class SelectedFolderNotInWorkspaceFolderError extends ToolkitError {
    constructor() {
        super(
            `The folder you chose isn't in your open workspace folder. You can add this folder to your workspace, or choose a folder in your open workspace.`,
            {
                code: 'SelectedFolderNotInWorkspaceFolder',
            }
        )
    }
}

export class PromptRefusalException extends ToolkitError {
    static errorName = 'PromptRefusalException'
    constructor() {
        super(
            'I\'m sorry, I can\'t generate code for your request. Please make sure your message and code files comply with the <a href="https://aws.amazon.com/machine-learning/responsible-ai/policy/">AWS Responsible AI Policy.</a>',
            {
                code: 'PromptRefusalException',
            }
        )
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
        super('Sorry, I ran into an issue while trying to upload your code. Please try again.', {
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
        super('Illegal transition between states, restart the conversation', { code: 'IllegalStateTransition' })
    }
}

export class ContentLengthError extends ToolkitError {
    static errorName = 'ContentLengthError'
    constructor() {
        super(
            'The folder you selected is too large for me to use as context. Please choose a smaller folder to work on. For more information on quotas, see the <a href="https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/software-dev.html#quotas" target="_blank">Amazon Q Developer documentation.</a>',
            { code: ContentLengthError.errorName }
        )
    }
}

export class ZipFileError extends ToolkitError {
    static errorName = 'ZipFileError'
    constructor() {
        super('The zip file is corrupted', { code: ZipFileError.errorName })
    }
}

export class PlanIterationLimitError extends ToolkitError {
    static errorName = 'PlanIterationLimitError'
    constructor() {
        super(
            'Sorry, you\'ve reached the quota for number of iterations on an implementation plan. You can generate code for this task or discuss a new plan. For more information on quotas, see the <a href="https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/software-dev.html#quotas">Amazon Q Developer documentation</a>.',
            { code: PlanIterationLimitError.errorName }
        )
    }
}

export class CodeIterationLimitError extends ToolkitError {
    static errorName = 'CodeIterationLimitError'
    constructor() {
        super(
            'Sorry, you\'ve reached the quota for number of iterations on code generation. You can insert this code in your files or discuss a new plan. For more information on quotas, see the <a href="https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/software-dev.html#quotas" target="_blank">Amazon Q Developer documentation.</a>',
            { code: CodeIterationLimitError.errorName }
        )
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
