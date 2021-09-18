/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger, showLogOutputChannel } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Window } from '../../shared/vscode/window'
import { ext } from '../extensionGlobals'
import { getIdeProperties, isCloud9 } from '../extensionUtilities'
import { Timeout } from './timeoutUtils'

export function makeFailedWriteMessage(filename: string): string {
    const message = localize('AWS.failedToWrite', '{0}: Failed to write "{1}".', getIdeProperties().company, filename)

    return message
}

/**
 * Shows a non-modal message with a "View Logs" button.
 *
 * @param message  Message text
 * @param window  Window
 * @param kind  Kind of message to show
 * @param extraItems  Extra buttons shown _before_ the "View Logs" button
 * @returns	Promise that resolves when a button is clicked or the message is
 * dismissed, and returns the selected button text.
 */
export async function showViewLogsMessage(
    message: string,
    window: Window = ext.window,
    kind: 'info' | 'warn' | 'error' = 'error',
    extraItems: string[] = []
): Promise<string | undefined> {
    const logsItem = localize('AWS.generic.message.viewLogs', 'View Logs...')
    const items = [...extraItems, logsItem]

    let p = undefined
    switch (kind) {
        case 'info':
            p = window.showInformationMessage(message, ...items)
            break
        case 'warn':
            p = window.showWarningMessage(message, ...items)
            break
        case 'error':
        default:
            p = window.showErrorMessage(message, ...items)
            break
    }
    return p.then<string | undefined>(selection => {
        if (selection === logsItem) {
            showLogOutputChannel()
        }
        return selection
    })
}

/**
 * Shows a modal confirmation (warning) message with buttons to confirm or cancel.
 *
 * @param prompt the message to show.
 * @param confirm the confirmation button text.
 * @param cancel the cancel button text.
 * @param window the window.
 */
export async function showConfirmationMessage(
    { prompt, confirm, cancel }: { prompt: string; confirm: string; cancel: string },
    window: Window
): Promise<boolean> {
    const confirmItem: vscode.MessageItem = { title: confirm }
    const cancelItem: vscode.MessageItem = { title: cancel, isCloseAffordance: true }

    const selection = await window.showWarningMessage(prompt, { modal: true }, confirmItem, cancelItem)
    return selection === confirmItem
}

/**
 * Shows an output channel and writes a line to it and also to the logs (as info).
 *
 * @param message the line to write.
 * @param outputChannel the output channel to write to.
 */
export function showOutputMessage(message: string, outputChannel: vscode.OutputChannel) {
    outputChannel.show(true)
    outputChannel.appendLine(message)
    getLogger().info(message)
}

/**
 * Attaches a Timeout object to VS Code's Progress notification system.
 * Not exported since it isn't used (yet)
 * @see showMessageWithCancel for an example usage
 */
async function showProgressWithTimeout(
    options: vscode.ProgressOptions,
    timeout: Timeout,
    window: Window = ext.window
): Promise<vscode.Progress<{ message?: string; increment?: number }>> {
    // Cloud9 doesn't support Progress notifications. User won't be able to cancel.
    if (isCloud9()) {
        options.location = vscode.ProgressLocation.Window
    }

    const progressPromise: Promise<vscode.Progress<{ message?: string; increment?: number }>> = new Promise(resolve => {
        window.withProgress(options, function (progress, token) {
            token.onCancellationRequested(() => timeout.complete(true))
            resolve(progress)
            return timeout.timer
        })
    })

    return progressPromise
}

/**
 * Presents the user with a notification to cancel a pending process.
 *
 * @param message Message to display
 * @param timeout Timeout object that will be killed if the user clicks 'Cancel'
 * @param window Window to display the message on (default: ext.window)
 *
 * @returns Progress object allowing the caller to update progress status
 */
export async function showMessageWithCancel(
    message: string,
    timeout: Timeout,
    window: Window = ext.window
): Promise<vscode.Progress<{ message?: string; increment?: number }>> {
    const progressOptions = { location: vscode.ProgressLocation.Notification, title: message, cancellable: true }
    return showProgressWithTimeout(progressOptions, timeout, window)
}
