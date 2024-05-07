/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ToolkitError, isUserCancelledError, resolveErrorMessageToDisplay } from '../errors'
import { getLogger } from '../logger'
import { showMessageWithUrl } from './messages'
import { Logging } from '../logger/commands'

/**
 * Logs the error. Then determines what kind of error message should be shown, if
 * at all.
 *
 * @param error The error itself
 * @param topic The prefix of the error message
 * @param defaultMessage The message to show if once cannot be resolved from the given error
 *
 * SIDE NOTE:
 * This is only being used for errors from commands and webview, there's plenty of other places
 * (explorer, nodes, ...) where it could be used. It needs to be apart of some sort of `core`
 * module that is guaranteed to initialize prior to every other Toolkit component.
 * Logging and telemetry would fit well within this core module.
 */
export async function logAndShowError(
    localize: nls.LocalizeFunc,
    error: unknown,
    topic: string,
    defaultMessage: string
) {
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
                await Logging.instance.viewLogsAtMessage.execute(logId)
            }
        })
    }
}

/**
 * Show a webview related error to the user + button that links to the logged error
 *
 * @param err The error that was thrown in the backend
 * @param webviewId Arbitrary value that identifies which webview had the error
 * @param command The high level command/function that was run which triggered the error
 */
export function logAndShowWebviewError(localize: nls.LocalizeFunc, err: unknown, webviewId: string, command: string) {
    // HACK: The following implementation is a hack, influenced by the implementation of handleError().
    // The userFacingError message will be seen in the UI, and the detailedError message will provide the
    // detailed information in the logs.
    const detailedError = ToolkitError.chain(err, `Webview backend command failed: "${command}()"`)
    const userFacingError = ToolkitError.chain(detailedError, 'Webview error')
    logAndShowError(localize, userFacingError, `webviewId="${webviewId}"`, 'Webview error').catch(e => {
        getLogger().error('logAndShowError failed: %s', (e as Error).message)
    })
}
