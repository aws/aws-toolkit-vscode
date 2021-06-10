/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { WIZARD_BACK } from '../wizards/wizard'
import { QuickInputButton } from './buttons'
import { Prompter, PrompterButtons, PromptResult } from './prompter'

/**
 * Options to configure the behavior of the input box UI.
 * Generally used to accommodate features not provided through vscode.InputBoxOptions
 */
export interface AdditionalInputBoxOptions {
    title?: string
    step?: number
    placeholder?: string
    totalSteps?: number
    buttons?: PrompterButtons<string>
    validateInput?(value: string): string | undefined
}

export type ExtendedInputBoxOptions = Omit<vscode.InputBoxOptions, 'buttons' | 'validateInput'> & AdditionalInputBoxOptions
export type DataInputBox = Omit<vscode.InputBox, 'buttons'> & { buttons: PrompterButtons<string> }

// TODO: move to utilities?
function applySettings<T1, T2 extends T1>(obj: T2, settings: T1): void { 
    Object.assign(obj, settings)
}

/**
 * Creates an InputBox to get a text response from the user.
 *
 * Used to wrap createInputBox and accommodate
 * a common set of features for the Toolkit.
 *
 * Parameters:
 *  options - initial InputBox configuration
 *  buttons - set of buttons to initialize the InputBox with
 * @return A new InputBox.
 */
export function createInputBox(options?: ExtendedInputBoxOptions): InputBoxPrompter {
    const inputBox = vscode.window.createInputBox() as DataInputBox

    applySettings(inputBox, options)

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

    public async prompt(): Promise<PromptResult<string>> {
        const promptPromise = new Promise<PromptResult<string>>((resolve, reject) => {
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
                    (button as QuickInputButton<string>).onClick(resolve, reject)
                }
            })
            this.inputBox.show()
        })

        return this.applyAfterCallbacks(await promptPromise)
    }

    public setLastResponse(picked: string): void {
        this.inputBox.value = picked
    }

    public getLastResponse(): string | undefined {
        return ''
    }
}