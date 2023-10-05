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

export class PanelIdNotFoundError extends ToolkitError {
    constructor(query: string) {
        super(`Panel id was not found from ${query}`, { code: 'PanelIdNotFound' })
    }
}

export class PanelNotFoundError extends ToolkitError {
    constructor() {
        super(`Panel was not found`, { code: 'PanelNotFound' })
    }
}

export class TabIdNotFoundError extends ToolkitError {
    constructor(query: string) {
        super(`Tab id was not found from ${query}`, { code: 'TabIdNotFound' })
    }
}

export class TabNotFoundError extends ToolkitError {
    constructor() {
        super(`Tab was not found`, { code: 'TabNotFound' })
    }
}

export class PanelLoadError extends ToolkitError {
    constructor() {
        super(`Weaverbird UI panel failed to load`, { code: 'PanelLoadFailed' })
    }
}
