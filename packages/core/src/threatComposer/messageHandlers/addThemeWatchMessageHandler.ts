/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command, MessageType, ThemeChangedMessage, WebviewContext } from '../types'
import vscode from 'vscode'

/**
 * Function to add a watcher on the VSCode theme. The watcher will notify Threat Composer
 * view when the theme is changed.
 * @param context: The Webview Context that contain the details of the file and the webview
 */
export function addThemeWatchMessageHandler(context: WebviewContext) {
    context.disposables.push(
        vscode.window.onDidChangeActiveColorTheme(async data => {
            const newTheme =
                data.kind === vscode.ColorThemeKind.Dark || data.kind === vscode.ColorThemeKind.HighContrast
                    ? 'dark'
                    : 'light'
            await broadcastThemeChange(newTheme, context.panel)
        })
    )
}

/**
 * Helper Function to broadcast the theme change to the Threat Composer view
 * @param newTheme: The updated theme
 * @param panel: the panel which contains the webview to be notified.
 */
export async function broadcastThemeChange(newTheme: string, panel: vscode.WebviewPanel) {
    const themeChangedMessage: ThemeChangedMessage = {
        messageType: MessageType.BROADCAST,
        command: Command.THEME_CHANGED,
        newTheme: newTheme,
    }

    await panel.webview.postMessage(themeChangedMessage)
}
