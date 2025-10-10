/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { WebviewView, By } from 'vscode-extension-tester'
import { clickButton, waitForElement } from '../utils/generalUtils'
/**
 * Clicks the tools to get to the MCP server overlay
 * @param webviewView The WebviewView instance
 * @returns Promise<boolean> True if tools button was found and clicked, false otherwise
 */
export async function addNewChatTab(webviewView: WebviewView): Promise<void> {
    try {
        await clickButton(
            webviewView,
            '[data-testid="tab-bar-wrapper"]',
            '[data-testid="tab-bar-tab-add-button"] .mynah-ui-icon-plus',
            'add chat button'
        )
    } catch (e) {
        throw new Error(`Failed to add new chat tab: ${e}`)
    }
}

export async function viewHistoryTab(webviewView: WebviewView): Promise<void> {
    try {
        await clickButton(
            webviewView,
            '[data-testid="tab-bar-buttons-wrapper"]',
            '[data-testid="tab-bar-button"] .mynah-ui-icon-history',
            'history button'
        )
    } catch (e) {
        throw new Error(`Failed to view history tab: ${e}`)
    }
}

export async function waitForHistoryList(webviewView: WebviewView): Promise<void> {
    await waitForElement(webviewView, By.css('.mynah-detailed-list-item-groups-wrapper'))
}

export async function closeHistoryTab(webviewView: WebviewView): Promise<void> {
    try {
        await clickButton(
            webviewView,
            '.mynah-sheet-header',
            '[data-testid="sheet-close-button"] .mynah-ui-icon-cancel',
            'history button'
        )
    } catch (e) {
        throw new Error(`Failed to close history tab: ${e}`)
    }
}
