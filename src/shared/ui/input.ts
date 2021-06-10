/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { applySettings } from '../utilities/collectionUtils'
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
    Omit<vscode.InputBoxOptions, 'buttons' | 'validateInput'> & AdditionalInputBoxOptions
export type DataInputBox = Omit<vscode.InputBox, 'buttons'> & { buttons: PrompterButtons<string> }

/**
 * Creates a new InputBox.
 * 
 * @param options Customizes the InputBox and InputBoxPrompter.
 * @returns An InputBoxPrompter. This can be used directly with the `prompt` method or can be fed into a Wizard.
 */
export function createInputBox(options?: ExtendedInputBoxOptions): InputBoxPrompter {
    const inputBox = vscode.window.createInputBox() as DataInputBox
    applySettings(inputBox, { ...options })

    if (options?.validateInput !== undefined) {
        inputBox.onDidChangeValue(
            value => inputBox.validationMessage = options.validateInput!(value)
        )
    }

    return new InputBoxPrompter(inputBox)
}

export class InputBoxPrompter extends Prompter<string> {
    
    constructor(public readonly inputBox: DataInputBox) {
        super(inputBox)
    }

    protected async promptUser(): Promise<PromptResult<string>> {
        const promptPromise = new Promise<PromptResult<string>>(resolve => {
            this.inputBox.onDidAccept(() => {
                if (!this.inputBox.validationMessage) {
                    resolve(this.inputBox.value)
                }
            })
            this.inputBox.onDidHide(() => resolve(undefined)) // TODO: change to wizard exit
            this.inputBox.onDidTriggerButton(button => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(WIZARD_BACK)
                } else {
                    (button as QuickInputButton<string>).onClick(resolve)
                }
            })
            this.inputBox.show()
        })

        return await promptPromise
    }

    public setLastResponse(picked: string): void {
        this.inputBox.value = picked
    }

    public getLastResponse(): string | undefined {
        return ''
    }
}