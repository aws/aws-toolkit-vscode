/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolkitError } from '../shared/errors'

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
        super(`Weaverbird UI panel failed to load`, { code: 'PanelLoadFailed' })
    }
}

export class WorkspaceFolderNotFoundError extends ToolkitError {
    constructor() {
        super(`Workspace folder was not found. Open a workspace to continue using Weaverbird`, {
            code: 'WorkspaceFolderNotFound',
        })
    }
}

export class SessionNotFoundError extends ToolkitError {
    constructor() {
        super(`Session was not found`, { code: 'SessionNotFound' })
    }
}

export class UserMessageNotFoundError extends ToolkitError {
    constructor() {
        super(`Message was not found`, { code: 'MessageNotFound' })
    }
}

export class WorkspaceRootNotFoundError extends ToolkitError {
    constructor() {
        super(`Unable to find workspace root from the provided source root`, {
            code: 'WorkspaceRootNotFound',
        })
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

const denyListedErrors: string[] = ['Deserialization error']

export function createUserFacingErrorMessage(message: string) {
    if (denyListedErrors.some(err => message.includes(err))) {
        return 'Weaverbird API request failed'
    }
    return message
}
