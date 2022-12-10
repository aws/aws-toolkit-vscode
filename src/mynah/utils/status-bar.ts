/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vs from 'vscode'

const STATUS_BAR_START_PRIORITY = 1000

/**
 * StatusBar update props
 */
interface StatusBarMainProps {
    text?: string
    tooltip?: string
    color?: string | vs.ThemeColor
    commands?: Record<string, string>
}

/**
 * StatusBar constructor props
 */
export interface StatusBarProps extends StatusBarMainProps {
    text: string
    priority?: number
    show?: boolean
}
export class StatusBar {
    private statusBar: undefined | vs.StatusBarItem
    private quicpickDisposable: undefined | vs.Disposable = undefined
    constructor(props: StatusBarProps) {
        this.statusBar = vs.window.createStatusBarItem(
            vs.StatusBarAlignment.Right,
            STATUS_BAR_START_PRIORITY + (props.priority ?? 0)
        )
        this.statusBar.text = props.text
        this.statusBar.tooltip = props.tooltip
        this.statusBar.color = props.color

        // If there is one single command, it will be set directly
        if (typeof props.commands !== 'undefined') {
            if (Object.keys(props.commands).length === 1) {
                this.statusBar.command = props.commands[Object.keys(props.commands)[0]]
            } else {
                this.statusBar.command = this.createQuickPick(props.commands)
            }
        }

        if (props.show !== false) {
            this.statusBar.show()
        }
    }

    /**
     * Gets an object map with the key as the visible text and value as the command name.
     * It will be used when there is more than one command given to the StatusBar
     * It returns the temporary command name to let the QuickPick open when that command called from StatusBar.
     * @param commands Record<string, string>
     * @returns string
     */
    private readonly createQuickPick = (commands: Record<string, string>): string => {
        // Dispose if there is a previous one
        if (this.quicpickDisposable !== undefined) {
            this.quicpickDisposable?.dispose()
            this.quicpickDisposable = undefined
        }

        // Create a temporary command name to open the QuickPick
        const quicpickCommand = `Mynah.statusBarQuickPick_${new Date().getTime()}`
        this.quicpickDisposable = vs.commands.registerCommand(quicpickCommand, () => {
            const pickyPick = vs.window.createQuickPick()
            pickyPick.onDidChangeSelection(selection => {
                if (selection[0] !== undefined) {
                    void vs.commands.executeCommand(commands[selection[0].label])
                    // The state of QuickPick visibility is not defined to be closed when an option is selected, needs to be hidden by manual call.
                    pickyPick.hide()
                }
            })

            // Adding the given key value pairs as commands to the quick pick.
            pickyPick.items = Object.keys(commands).map(command => ({ label: command, picked: false }))
            pickyPick.onDidHide(() => pickyPick.dispose())
            pickyPick.show()
        })
        return quicpickCommand
    }

    update = (props: StatusBarMainProps): void => {
        if (this.statusBar !== undefined) {
            this.statusBar.text = props.text ?? this.statusBar.text
            this.statusBar.color = props.color ?? this.statusBar.color
            this.statusBar.tooltip = props.tooltip ?? this.statusBar.tooltip

            // If there is one single command, it will be set directly
            if (typeof props.commands !== 'undefined') {
                if (Object.keys(props.commands).length === 1) {
                    this.statusBar.command = props.commands[Object.keys(props.commands)[0]]
                } else {
                    this.statusBar.command = this.createQuickPick(props.commands)
                }
            }
        }
    }

    show = (): void => this.statusBar?.show()
    hide = (): void => this.statusBar?.hide()

    destroy = (): void => {
        // If there is a QuickPick generated before, destroy it completely.
        if (this.quicpickDisposable !== undefined) {
            this.quicpickDisposable.dispose()
            this.quicpickDisposable = undefined
        }

        // Destroying the StatusBar
        this.statusBar?.hide()
        this.statusBar?.dispose()
        this.statusBar = undefined
    }
}
