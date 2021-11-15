/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { UnionPromise } from '../utilities/tsUtils'
import { WizardControl } from '../wizards/util'
import { PrompterButtons, QuickInputButton } from './buttons'
import { Prompter, PromptResult } from './prompter'

type QuickInput = vscode.QuickInput & { buttons: PrompterButtons<any, any> }

interface Update {
    promise: Promise<any>
    disableInput: boolean
}

export abstract class QuickInputPrompter<T = any> extends Prompter<T> {
    protected disposables: vscode.Disposable[] = []
    private updatesCounter = 0
    /** Updates to the UI that keep it in a busy (or potentially disabled) state. */
    private updates: Map<number, Update> = new Map()
    private onDidShowEmitter = new vscode.EventEmitter<void>()
    private onDidChangeBusyEmitter = new vscode.EventEmitter<boolean>()
    private onDidChangeEnablementEmitter = new vscode.EventEmitter<boolean>()
    /** Event that is fired immediately after the prompter is shown. */
    public onDidShow = this.onDidShowEmitter.event
    /** Event that is fired whenever the prompter changes 'busy' state. */
    public onDidChangeBusy = this.onDidChangeBusyEmitter.event
    /** Event that is fired whenever the prompter changes 'enabled' state. */
    public onDidChangeEnablement = this.onDidChangeEnablementEmitter.event

    constructor(private readonly quickInput: QuickInput) {
        super()
        this.disposables.push(this.onDidShowEmitter, this.onDidChangeBusyEmitter, this.onDidChangeEnablementEmitter)
    }

    private set busy(state: boolean) {
        const prev = this.quickInput.busy
        if (prev !== state) {
            this.quickInput.busy = state
            this.onDidChangeBusyEmitter.fire(state)
        }
    }

    private set enabled(state: boolean) {
        const prev = this.quickInput.enabled
        if (prev !== state) {
            this.quickInput.enabled = state
            this.onDidChangeEnablementEmitter.fire(state)
        }
    }

    protected get pendingUpdates(): number {
        return this.updates.size
    }

    public get pendingUpdate(): boolean {
        return this.updates.size > 0
    }

    public setSteps(current: number, total: number) {
        this.quickInput.step = current
        this.quickInput.totalSteps = total
    }

    protected handleButton<T>(
        button: (vscode.QuickInputButton & { onClick?: unknown }) | QuickInputButton<T>,
        resolve: (result: PromptResult<T>) => void
    ): void {
        if (button === vscode.QuickInputButtons.Back) {
            resolve(WizardControl.Back)
        } else if (button.onClick !== undefined && typeof button.onClick === 'function') {
            const response = button.onClick()
            if (response !== undefined) {
                resolve(response)
            }
        }
    }

    /**
     * Adds a new Promise that performs some async operation on the QuickInput.
     *
     * @param update Pending update to the QuickInput
     * @param disableInput Disables the QuickInput while this Promise is active (default: false)
     */
    protected addBusyUpdate(update: Promise<any>, disableInput = false): Promise<any> {
        this.busy = true
        this.enabled = !disableInput

        const handle = this.updatesCounter++
        const after = update.finally(() => {
            this.updates.delete(handle)
            this.busy = this.pendingUpdate
            this.enabled = !Array.from(this.updates.values()).some(u => u.disableInput)
        })

        this.updates.set(handle, { promise: after, disableInput })
        return after
    }

    public addButton(
        button: vscode.QuickInputButton,
        onClick?: (this: this) => UnionPromise<PromptResult<T> | void>
    ): this {
        this.quickInput.buttons = [{ ...button, onClick: onClick?.bind(this) }, ...this.quickInput.buttons]
        return this
    }

    public show(): void {
        this.quickInput.show()
        this.onDidShowEmitter.fire()
    }

    public dispose(): void {
        // TODO: we may want to call this on the previous prompter at the start of the next prompt in the wizard flow
        // the VS Code source re-uses the same UI element for all QuickInput instances, however, the hooks are unique
        // to each instance.
        super.dispose()
        this.quickInput.dispose()
        vscode.Disposable.from(...this.disposables).dispose()
    }
}
