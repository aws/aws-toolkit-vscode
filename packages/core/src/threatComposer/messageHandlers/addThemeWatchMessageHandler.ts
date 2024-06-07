/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command, MessageType, ThemeChangedMessage } from '../types'
import { ColorTheme, ColorThemeKind, WebviewPanel } from 'vscode'

/**
 * Handler for theme change event. It will broadcast the theme change event to the
 * Threat Composer webview, so that it can update the UI accordingly.
 * @param colorTheme The updated color theme
 * @param panel The panel which contains the webview to be notified.
 */
export async function onThemeChanged(colorTheme: ColorTheme, panel: WebviewPanel) {
    const colorThemeKind = colorTheme.kind
    const newTheme =
        colorThemeKind === ColorThemeKind.Dark || colorThemeKind === ColorThemeKind.HighContrast ? 'dark' : 'light'
    await broadcastThemeChange(newTheme, panel)
}

/**
 * Helper Function to broadcast the theme change to the Threat Composer view
 * @param newTheme: The updated theme
 * @param panel: the panel which contains the webview to be notified.
 */
export async function broadcastThemeChange(newTheme: string, panel: WebviewPanel) {
    const themeChangedMessage: ThemeChangedMessage = {
        messageType: MessageType.BROADCAST,
        command: Command.THEME_CHANGED,
        newTheme: newTheme,
    }

    await panel.webview.postMessage(themeChangedMessage)
}
