/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

const STATUS_PRIORITY = 100
const STATUS_TOOLTIP = localize('AWS.mde.statusbar.tooltip', 'Click to view MDE configuration')

export async function initStatusBar(): Promise<void> {
    const statusbarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, STATUS_PRIORITY)
    statusbarItem.command = 'aws.mde.configure.current'
    statusbarItem.tooltip = STATUS_TOOLTIP
    statusbarItem.text = `$(cloud) ${localize('AWS.mde.statusbar.text', 'Connected to MDE')}`
    statusbarItem.show()
}
