/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getIdeProperties } from '../extensionUtilities'
import { getLogger, showLogOutputChannel } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Window } from '../../shared/vscode/window'

export function makeCheckLogsMessage(): string {
    const commandName = localize('AWS.command.viewLogs', 'View AWS Toolkit Logs')
    const message = localize(
        'AWS.error.check.logs',
        'Check the logs for more information by running the "{0}" command from the {1}.',
        commandName,
        getIdeProperties().commandPalette
    )

    return message
}

export function makeFailedWriteMessage(filename: string): string {
    const commandName = localize('AWS.command.viewLogs', 'View AWS Toolkit Logs')
    const message = localize(
        'AWS.failedToWrite',
        'AWS: Failed to write "{0}". Use the "{1}" command to see error details.',
        filename,
        commandName
    )

    return message
}

/**
 * Shows a non-modal error message with a button to open the log output channel.
 *
 * @returns	A promise that resolves when the button is clicked or the error is dismissed.
 */
export async function showErrorWithLogs(message: string, window: Window): Promise<void> {
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
