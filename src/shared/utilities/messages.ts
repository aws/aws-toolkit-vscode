/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getIdeProperties, isCloud9, isCn } from '../extensionUtilities'
import { getLogger, showLogOutputChannel } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Window } from '../../shared/vscode/window'
import { ext } from '../extensionGlobals'
import { Timeout } from './timeoutUtils'

// function instead of constant to prevent isCn() from running prior to compute region being determined
// two localized strings instead of a single one with a parameter since this is also used as a command name
function commandName(): string {
    return isCn() ? localize('AWS.command.viewLogs.cn', 'View Amazon Toolkit Logs') :  localize('AWS.command.viewLogs', 'View AWS Toolkit Logs')
}

export function makeCheckLogsMessage(): string {
    const message = localize(
        'AWS.error.check.logs',
        'Check the logs for more information by running the "{0}" command from the {1}.',
        commandName(),
        getIdeProperties().commandPalette
    )

    return message
}

export function makeFailedWriteMessage(filename: string): string {
    const message = localize(
        'AWS.failedToWrite',
        '{0}: Failed to write "{1}". Use the "{2}" command to see error details.',
        getIdeProperties().company,
        filename,
        commandName()
    )

    return message
}

/**
 * Shows a non-modal error message with a button to open the log output channel.
 *
 * @returns	A promise that resolves when the button is clicked or the error is dismissed.
 */
export async function showErrorWithLogs(message: string, window: Window = ext.window): Promise<void> {
    const logsItem = localize('AWS.generic.message.viewLogs', 'View Logs...')

    return window
        .showErrorMessage(message, localize('AWS.generic.message.viewLogs', 'View Logs...'))
        .then(selection => {
            if (selection === logsItem) {
                showLogOutputChannel()
            }
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
