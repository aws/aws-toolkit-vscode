/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { applyPrimitives } from '../utilities/collectionUtils'
import { WIZARD_BACK } from '../wizards/wizard'
import { QuickInputButton } from './buttons'
import { Prompter, PrompterButtons, PromptResult } from './prompter'

/** Additional options to configure the `InputBox` beyond the standard API */
interface AdditionalInputBoxOptions {
    title?: string
    step?: number
    placeholder?: string
    totalSteps?: number
    buttons?: PrompterButtons<string>
    validateInput?(value: string): string | undefined
}

export type ExtendedInputBoxOptions = 
    Omit<vscode.InputBoxOptions, 'buttons' | 'validateInput' | 'placeHolder'> & AdditionalInputBoxOptions
export type DataInputBox = Omit<vscode.InputBox, 'buttons'> & { buttons: PrompterButtons<string> }

export const DEFAULT_INPUTBOX_OPTIONS: vscode.InputBoxOptions = {
    ignoreFocusOut: true,
}

/**
 * Creates a new InputBox.
 * 
 * @param options Customizes the InputBox and InputBoxPrompter.
 * @returns An InputBoxPrompter. This can be used directly with the `prompt` method or can be fed into a Wizard.
 */
export function createInputBox(options?: ExtendedInputBoxOptions): InputBoxPrompter {
    const inputBox = vscode.window.createInputBox() as DataInputBox
    applyPrimitives(inputBox, { ...DEFAULT_INPUTBOX_OPTIONS, ...options })

    const prompter = new InputBoxPrompter(inputBox)

    if (options?.validateInput !== undefined) {
        prompter.setValidation(input => options.validateInput!(input))
    }

    return prompter
}

export class InputBoxPrompter extends Prompter<string> {
    private lastResponse?: string
    private validateEvents: vscode.Disposable[] = []

    constructor(public readonly inputBox: DataInputBox) {
        super()
    }

    public setSteps(current: number, total: number): void {
        this.inputBox.step = current
        this.inputBox.totalSteps = total
    }

    public setValidation(validate: (value: string) => string | undefined): void {
        this.validateEvents.forEach(d => d.dispose())
        this.validateEvents = []
        
        this.inputBox.onDidChangeValue(
            value => this.inputBox.validationMessage = validate(value),
            this.validateEvents,
        )
        this.inputBox.onDidAccept(
            () => this.inputBox.validationMessage = validate(this.inputBox.value),
            this.validateEvents,
        )
    }

    protected async promptUser(): Promise<PromptResult<string>> {
        const promptPromise = new Promise<PromptResult<string>>(resolve => {
            this.inputBox.onDidAccept(() => {
                this.lastResponse = this.inputBox.value
                if (!this.inputBox.validationMessage) {
                    resolve(this.inputBox.value)
                }
            })
            this.inputBox.onDidHide(() => resolve(undefined)) // TODO: change to wizard exit
            this.inputBox.onDidTriggerButton(button => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(WIZARD_BACK)
                } else if ((button as QuickInputButton<string>).onClick !== undefined) {
                    const response = (button as QuickInputButton<string>).onClick!()
                    if (response !== undefined) {
                        resolve(response)
                    }
                }
            })
            this.inputBox.show()
        }).finally(() => this.inputBox.hide())

        return await promptPromise
    }

    public setLastResponse(picked: string): void {
        this.inputBox.value = picked
    }

    public getLastResponse(): string | undefined {
        return this.lastResponse
    }
}