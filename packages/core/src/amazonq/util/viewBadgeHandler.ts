/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { window, TreeItem, TreeView, ViewBadge } from 'vscode'
import { getLogger } from '../../shared/logger'
import globals from '../../shared/extensionGlobals'
import { AuthUtil } from '../../codewhisperer/util/authUtil'
import { GlobalState } from '../../shared/globalState'

let badgeHelperView: TreeView<void> | undefined
const mementoKey = 'hasAlreadyOpenedAmazonQ'

/**
 * invisible view meant exclusively to handle the view badge, note declaration has `"when": false`.
 * webviews can provide a badge (you can hack it to show strings!), BUT:
 * webview views can't show badges until they are loaded,
 * so our best option is to use a do-nothing tree view and show a '1'
 */
export async function activateBadge() {
    badgeHelperView = window.createTreeView('aws.AmazonQNeverShowBadge', {
        treeDataProvider: {
            getChildren: () => [],
            getTreeItem: () => new TreeItem(''),
        },
    })
    await showInitialViewBadge()
}

/**
 * Changes the view badge for the hidden view connected to the Amazon Q view
 * @param badge ViewBadge to show, or undefined to blank the badge
 */
export function changeViewBadge(badge?: ViewBadge) {
    if (badgeHelperView) {
        badgeHelperView.badge = badge
    } else {
        getLogger().error('Attempted to call changeViewBadge before badgeHelperView set.')
    }
}

/**
 * Removes the view badge from the badge helper view and prevents it from showing up ever again
 */
export function deactivateInitialViewBadge() {
    GlobalState.instance.tryUpdate(mementoKey, true)
    changeViewBadge()
}

/**
 * Show users a '1' badge on the Amazon Q icon if {@link shouldShowBadge} is true.
 *
 * This is intended to target users who are already using CWSPR and
 * are autoupdating to a version of the extension with Q,
 * since they may not know it exists otherwise.
 */
async function showInitialViewBadge() {
    if (await shouldShowBadge()) {
        changeViewBadge({
            value: 1,
            tooltip: '',
        })
    }
}

/**
 * Determines if a user should see an attract badge to entice them to use Amazon Q
 * Shows a badge on the Amazon Q View Container IF:
 * * the user has never, ever clicked into Amazon Q
 * * The user has codewhispererCore auth and not codewhispererChat auth
 *
 * @returns True if the badge should be shown, false otherwise
 */
export async function shouldShowBadge(): Promise<boolean> {
    const memento = globals.context.globalState
    const hasAlreadyShown = memento.get(mementoKey)
    if (!hasAlreadyShown) {
        const state = await AuthUtil.instance.getChatAuthState()
        if (state.codewhispererCore === 'connected' && state.codewhispererChat !== 'connected') {
            return true
        }
    }

    return false
}
