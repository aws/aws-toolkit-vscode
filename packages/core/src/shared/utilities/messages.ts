/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import * as localizedText from '../localizedText'
import { getLogger, showLogOutputChannel } from '../../shared/logger'
import { ProgressEntry } from '../../shared/vscode/window'
import { getIdeProperties, isCloud9 } from '../extensionUtilities'
import { sleep } from './timeoutUtils'
import { Timeout } from './timeoutUtils'
import { addCodiconToString } from './textUtilities'
import { getIcon, codicon } from '../icons'
import globals from '../extensionGlobals'
import { openUrl } from './vsCodeUtils'
import { PromptSettings } from '../../shared/settings'

export const messages = {
    editCredentials(icon: boolean) {
        // codicons are not supported in showInformationMessage. (vscode 1.71)
        const icon_ = icon ? codicon`${getIcon('vscode-edit')}` + ' ' : ''
        return localize('AWS.credentials.edit', '{0}Edit Credentials', icon_)
    },
}

const localize = nls.loadMessageBundle()

export function makeFailedWriteMessage(filename: string): string {
    const message = localize('AWS.failedToWrite', '{0}: Failed to write "{1}".', getIdeProperties().company, filename)

    return message
}

function showMessageWithItems(
    message: string,
    kind: 'info' | 'warn' | 'error' = 'error',
    items: string[] = [],
    useModal: boolean = false
): Thenable<string | undefined> {
    switch (kind) {
        case 'info':
            return vscode.window.showInformationMessage(message, { modal: useModal }, ...items)
        case 'warn':
            return vscode.window.showWarningMessage(message, { modal: useModal }, ...items)
        case 'error':
        default:
            return vscode.window.showErrorMessage(message, { modal: useModal }, ...items)
    }
}

/**
 * Shows a non-modal message with a linkbutton.
 *
 * @param message  Message text
 * @param url URL to visit when `urlItem` is clicked
 * @param urlItem URL button text (default: "View Documentation")
 * @param kind  Kind of message to show
 * @param extraItems  Extra buttons shown _before_ the "View Documentation" button
 * @param useModal Flag to use a modal instead of a toast notification
 * @returns Promise that resolves when a button is clicked or the message is
 * dismissed, and returns the selected button text.
 */
export async function showMessageWithUrl(
    message: string,
    url: string | vscode.Uri,
    urlItem: string = localizedText.viewDocs,
    kind: 'info' | 'warn' | 'error' = 'error',
    extraItems: string[] = [],
    useModal: boolean = false
): Promise<string | undefined> {
    const uri = typeof url === 'string' ? vscode.Uri.parse(url) : url
    const items = [...extraItems, urlItem]

    const p = showMessageWithItems(message, kind, items, useModal)
    return p.then<string | undefined>(selection => {
        if (selection === urlItem) {
            void openUrl(uri)
        }
        return selection
    })
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
    kind: 'info' | 'warn' | 'error' = 'error',
    extraItems: string[] = []
): Promise<string | undefined> {
    const logsItem = localize('AWS.generic.message.viewLogs', 'View Logs...')
    const items = [...extraItems, logsItem]

    const p = showMessageWithItems(message, kind, items)
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
export async function showConfirmationMessage({
    prompt,
    confirm,
    cancel,
    type,
}: {
    prompt: string
    confirm?: string
    cancel?: string
    type?: 'info' | 'warning'
}): Promise<boolean> {
    const confirmItem: vscode.MessageItem = { title: confirm ?? localizedText.confirm }
    const cancelItem: vscode.MessageItem = { title: cancel ?? localizedText.cancel, isCloseAffordance: true }

    if (type === 'info') {
        const selection = await vscode.window.showInformationMessage(prompt, { modal: true }, confirmItem, cancelItem)
        return selection?.title === confirmItem.title
    } else {
        const selection = await vscode.window.showWarningMessage(prompt, { modal: true }, confirmItem, cancelItem)
        return selection?.title === confirmItem.title
    }
}

/**
 * Shows a prompt for the user to reauthenticate
 *
 * @param message the line informing the user that they need to reauthenticate
 * @param connect the text to display on the "connect" button
 * @param suppressId the ID of the prompt in
 * @param reauthFunc the function called if the "connect" button is clicked
 */
export async function showReauthenticateMessage({
    message,
    connect,
    suppressId,
    reauthFunc,
}: {
    message: string
    connect: string
    suppressId: Parameters<PromptSettings['isPromptEnabled']>[0]
    reauthFunc: () => Promise<void>
}) {
    const settings = PromptSettings.instance
    const shouldShow = await settings.isPromptEnabled(suppressId)
    if (!shouldShow) {
        return
    }

    await vscode.window.showInformationMessage(message, connect, localizedText.dontShow).then(async resp => {
        if (resp === connect) {
            await reauthFunc()
        } else if (resp === localizedText.dontShow) {
            await settings.disablePrompt(suppressId)
        }
    })
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
 *
 * @see showMessageWithCancel for an example usage
 */
async function showProgressWithTimeout(
    options: vscode.ProgressOptions,
    timeout: Timeout,
    showAfterMs: number
): Promise<vscode.Progress<{ message?: string; increment?: number }>> {
    if (showAfterMs < 0) {
        throw Error('invalid "showAfterMs" value')
    }
    if (showAfterMs === 0) {
        showAfterMs = 1 // Show immediately.
    }
    // Cloud9 doesn't support `ProgressLocation.Notification`. User won't be able to cancel.
    if (isCloud9()) {
        options.location = vscode.ProgressLocation.Window
    }

    // See also: codecatalyst.ts:LazyProgress
    const progressPromise: Promise<vscode.Progress<{ message?: string; increment?: number }>> = new Promise(
        (resolve, reject) => {
            setTimeout(async () => {
                try {
                    if (timeout.completed) {
                        getLogger().debug('showProgressWithTimeout: completed before "showAfterMs"')
                        resolve({
                            report: () => undefined, // no-op.
                        })
                        return
                    }
                    void vscode.window.withProgress(options, function (progress, token) {
                        token.onCancellationRequested(() => timeout.cancel())
                        resolve(progress)
                        return new Promise(timeout.onCompletion)
                    })
                } catch (e) {
                    getLogger().error('report(): progressPromise failed', e)
                    reject(e)
                }
            }, showAfterMs)
        }
    )

    return progressPromise
}

/**
 * Shows a Progress message which allows the user to cancel a pending `timeout` task.
 *
 * Logs on failure; call with `void` if you don't need the result.
 *
 * @param message Message to display
 * @param timeout Timeout object that will be killed if the user clicks 'Cancel'
 * @param showAfterMs Do not show the progress message until `showAfterMs` milliseconds.
 *
 * @returns Progress object allowing the caller to update progress status
 */
export async function showMessageWithCancel(
    message: string,
    timeout: Timeout,
    showAfterMs: number = 0
): Promise<vscode.Progress<{ message?: string; increment?: number }>> {
    const progressOptions = { location: vscode.ProgressLocation.Notification, title: message, cancellable: true }
    return showProgressWithTimeout(progressOptions, timeout, showAfterMs)
}

type MessageItems = { timeout: Timeout; progress: vscode.Progress<ProgressEntry> }

/**
 * Start or Update VSCode message windows with a 'Cancel' button.
 *
 * ---
 *
 * This class helps in the scenario of ensuring that a previous
 * identical message is completed before it attempts to create
 * a new one.
 */
export class Messages {
    static readonly timeoutMillis = 60000
    private static messageMap: {
        [msgId: string]: MessageItems
    } = {}

    /**
     * Starts a message if it does not exist, then applies the update with the given
     * progress data.
     * @param msgId A unique identifier for a message
     * @returns The timeout associated with the message, returns an existing timeout
     *          if the message already exists.
     */
    static async putMessage(
        msgId: string,
        messageText: string,
        progressEntry?: ProgressEntry,
        timeoutMillis?: number
    ): Promise<Timeout> {
        let message: MessageItems | undefined = this.messageMap[msgId]

        //  If message already exists but is completed, we want to start a new message
        if (message?.timeout !== undefined && message.timeout.completed) {
            message = undefined
        }

        // Start a new message
        if (message === undefined) {
            await this.startMessage(msgId, messageText, timeoutMillis)
            message = this.messageMap[msgId]
        }

        // Add an update to the message if it was provided
        if (progressEntry !== undefined) {
            message.progress.report(progressEntry)
        }

        return message.timeout
    }

    /**
     * @param timeoutMillis The amount of milliseconds till the message cancels itself.
     */
    private static async startMessage(
        msgId: string,
        messageText: string,
        timeoutMillis: number = this.timeoutMillis
    ): Promise<void> {
        const timeout = new Timeout(timeoutMillis)
        this.messageMap[msgId] = { timeout, progress: await showMessageWithCancel(messageText, timeout) }
    }
}

/**
 * Shows a "spinner" / progress message for `duration` milliseconds.
 *
 * @param message Message to display
 * @param duration Timeout duration (milliseconds)
 *
 * @returns prompts message to user on with progress
 */
export async function showTimedMessage(message: string, duration: number) {
    void vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: message,
            cancellable: false,
        },
        async () => {
            await sleep(duration)
        }
    )
}

export async function copyToClipboard(data: string, label?: string): Promise<void> {
    await vscode.env.clipboard.writeText(data)
    const message = localize('AWS.explorerNode.copiedToClipboard', 'Copied {0} to clipboard', label)
    vscode.window.setStatusBarMessage(addCodiconToString('clippy', message), 5000)
    getLogger().verbose('copied %s to clipboard: %O', label ?? '', data)
}

export async function showOnce<T>(
    key: string,
    fn: () => Promise<T>,
    memento = globals.context.globalState
): Promise<T | undefined> {
    if (memento.get(key)) {
        return
    }

    const result = fn()
    await memento.update(key, true)

    return result
}
