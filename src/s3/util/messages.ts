/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger, showLogOutputChannel } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Window } from '../../shared/vscode/window'

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
 * Creates a readable path to an s3 bucket or object (e.g. s3://...).
 *
 * This is the format used by AWS CLI.
 * @see https://docs.aws.amazon.com/cli/latest/reference/s3/#path-argument-type
 *
 * @param bucket contains the name of the bucket.
 * @param path to the object, or an empty string if this is the root of the bucket.
 * @returns the readable path to the s3 bucket or object (e.g. s3://...).
 */
export function readablePath({ bucket, path }: { bucket: { name: string }; path: string }): string {
    return path ? `s3://${bucket.name}/${path}` : `s3://${bucket.name}`
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
