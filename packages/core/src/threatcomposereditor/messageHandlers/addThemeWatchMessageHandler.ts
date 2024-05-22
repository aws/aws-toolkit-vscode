/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType, ThemeChangedMessage, Command, WebviewContext } from '../types'
import vscode from 'vscode'

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

export async function broadcastThemeChange(newTheme: string, panel: vscode.WebviewPanel) {
    const themeChangedMessage: ThemeChangedMessage = {
        messageType: MessageType.BROADCAST,
        command: Command.THEME_CHANGED,
        newTheme: newTheme,
    }

    await panel.webview.postMessage(themeChangedMessage)
}
