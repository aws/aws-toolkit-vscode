/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import vscode from 'vscode'
import { isUserCancelledError, resolveErrorMessageToDisplay, ToolkitError } from '../errors'
import { getLogger } from '../logger'
import { Logging } from '../logger/commands'
import { showMessageWithUrl } from './messages'

/**
 * The high level function for showing the error to the user.
 * 
 * @param error The error itself
 * @param topic The prefix of the error message
 * @param defaultMessage The message to show if once cannot be resolved from the given error
 * 
 * SIDE NOTE:
 * This is only being used for errors from commands although there's plenty of other places where it
 * could be used. It needs to be apart of some sort of `core` module that is guaranteed to initialize
 * prior to every other Toolkit component. Logging and telemetry would fit well within this core module.
 */
export async function showErrorToUser(error: unknown, topic: string, defaultMessage: string) {
    if (isUserCancelledError(error)) {
        getLogger().verbose(`${topic}: user cancelled`)
        return
    }
    const logsItem = localize('AWS.generic.message.viewLogs', 'View Logs...')
    const logId = getLogger().error(`${topic}: %s`, error)
    const message = resolveErrorMessageToDisplay(error, defaultMessage)

    if (error instanceof ToolkitError && error.documentationUri) {
        await showMessageWithUrl(message, error.documentationUri, 'View Documentation', 'error')
    } else {
        await vscode.window.showErrorMessage(message, logsItem).then(async resp => {
            if (resp === logsItem) {
                await Logging.declared.viewLogsAtMessage.execute(logId)
            }
        })
    }
}
