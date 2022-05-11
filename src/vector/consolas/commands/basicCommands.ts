/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { activate as activateView } from '../vue/backend'
import { ExtContext } from '../../../shared/extensions'
import { Commands } from '../../../shared/vscode/commands2'
import { ConsolasConstants } from '../models/constants'
import { getLogger } from '../../../shared/logger'

export const toggleCodeSuggestions = Commands.declare(
    'aws.consolas.toggleCodeSuggestion',
    (context: ExtContext) => async () => {
        const autoTriggerEnabled: boolean = get(ConsolasConstants.CONSOLAS_AUTO_TRIGGER_ENABLED_KEY, context) || false
        set(ConsolasConstants.CONSOLAS_AUTO_TRIGGER_ENABLED_KEY, !autoTriggerEnabled, context)
        await vscode.commands.executeCommand('aws.refreshAwsExplorer')
    }
)

export const enableCodeSuggestions = Commands.declare(
    'aws.consolas.enableCodeSuggestions',
    (context: ExtContext) => async () => {
        activateView(context)
    }
)

export const showIntroduction = Commands.declare('aws.consolas.introduction', (context: ExtContext) => async () => {
    vscode.env.openExternal(vscode.Uri.parse(ConsolasConstants.CONSOLAS_LEARN_MORE_URI))
})

export function get(key: string, context: ExtContext): any {
    return context.extensionContext.globalState.get(key)
}

export function set(key: string, value: any, context: ExtContext): void {
    context.extensionContext.globalState.update(key, value).then(
        () => {},
        error => {
            getLogger().verbose(`Failed to update global state: ${error}`)
        }
    )
}
