/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { CodeSuggestionsState } from '../models/model'
import { AuthUtil } from '../util/authUtil'
import { getSelectedCustomization } from '../util/customizationUtil'
import { codicon, getIcon } from '../../shared/icons'
import { Commands } from '../../shared/vscode/commands2'
import { listCodeWhispererCommandsId } from '../ui/statusBarMenu'

export class InlineCompletionService {
    private statusBar: CodeWhispererStatusBar

    constructor(statusBar: CodeWhispererStatusBar = CodeWhispererStatusBar.instance) {
        this.statusBar = statusBar

        CodeSuggestionsState.instance.onDidChangeState(() => {
            return this.refreshStatusBar()
        })
    }

    static #instance: InlineCompletionService

    public static get instance() {
        return (this.#instance ??= new this())
    }

    /** Updates the status bar to represent the latest CW state */
    refreshStatusBar() {
        if (AuthUtil.instance.isConnectionValid()) {
            if (AuthUtil.instance.requireProfileSelection()) {
                return this.setState('needsProfile')
            }
            return this.setState('ok')
        } else if (AuthUtil.instance.isConnectionExpired()) {
            return this.setState('expired')
        } else {
            return this.setState('notConnected')
        }
    }

    private async setState(state: keyof typeof states) {
        switch (state) {
            case 'loading': {
                await this.statusBar.setState('loading')
                break
            }
            case 'ok': {
                await this.statusBar.setState('ok', CodeSuggestionsState.instance.isSuggestionsEnabled())
                break
            }
            case 'expired': {
                await this.statusBar.setState('expired')
                break
            }
            case 'notConnected': {
                await this.statusBar.setState('notConnected')
                break
            }
            case 'needsProfile': {
                await this.statusBar.setState('needsProfile')
                break
            }
        }
    }
}

/** The states that the completion service can be in */
const states = {
    loading: 'loading',
    ok: 'ok',
    expired: 'expired',
    notConnected: 'notConnected',
    needsProfile: 'needsProfile',
} as const

export class CodeWhispererStatusBar {
    protected statusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1)

    static #instance: CodeWhispererStatusBar
    static get instance() {
        return (this.#instance ??= new this())
    }

    protected constructor() {}

    async setState(state: keyof Omit<typeof states, 'ok'>): Promise<void>
    async setState(status: keyof Pick<typeof states, 'ok'>, isSuggestionsEnabled: boolean): Promise<void>
    async setState(status: keyof typeof states, isSuggestionsEnabled?: boolean): Promise<void> {
        const statusBar = this.statusBar
        statusBar.command = listCodeWhispererCommandsId
        statusBar.backgroundColor = undefined

        const title = 'Amazon Q'
        switch (status) {
            case 'loading': {
                const selectedCustomization = getSelectedCustomization()
                statusBar.text = codicon` ${getIcon('vscode-loading~spin')} ${title}${
                    selectedCustomization.arn === '' ? '' : ` | ${selectedCustomization.name}`
                }`
                break
            }
            case 'ok': {
                const selectedCustomization = getSelectedCustomization()
                const icon = isSuggestionsEnabled ? getIcon('vscode-debug-start') : getIcon('vscode-debug-pause')
                statusBar.text = codicon`${icon} ${title}${
                    selectedCustomization.arn === '' ? '' : ` | ${selectedCustomization.name}`
                }`
                break
            }

            case 'expired': {
                statusBar.text = codicon` ${getIcon('vscode-debug-disconnect')} ${title}`
                statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
                break
            }
            case 'needsProfile':
            case 'notConnected':
                statusBar.text = codicon` ${getIcon('vscode-chrome-close')} ${title}`
                statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
                break
        }

        statusBar.show()
    }
}

/** In this module due to circulare dependency issues */
export const refreshStatusBar = Commands.declare(
    { id: 'aws.amazonq.refreshStatusBar', logging: false },
    () => async () => {
        await InlineCompletionService.instance.refreshStatusBar()
    }
)
