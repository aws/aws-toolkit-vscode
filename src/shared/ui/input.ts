/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { WizardControl } from '../wizards/wizard'
import { QuickInputButton } from './buttons'
import { Prompter, PrompterButtons, PromptResult } from './prompter'

type InputBoxButton = QuickInputButton<string | WizardControl>
type InputBoxButtons = PrompterButtons<string>

/**
 * Options to configure the behavior of the input box UI.
 * Generally used to accommodate features not provided through vscode.InputBoxOptions
 */
export interface AdditionalInputBoxOptions {
    title?: string
    step?: number
    placeholder?: string
    totalSteps?: number
    buttons?: InputBoxButtons
    validateInput?(value: string): string | undefined | Promise<string | undefined>
}

export type ExtendedInputBoxOptions = Omit<vscode.InputBoxOptions, 'buttons' | 'validateInput'> & AdditionalInputBoxOptions
export type DataInputBox = Omit<vscode.InputBox, 'buttons'> & { buttons: InputBoxButtons }

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
            value => {
                inputBox.validationMessage = options.validateInput!(value) as any
            },
            inputBox
        )
    }

    return new InputBoxPrompter(inputBox)
}

export class InputBoxPrompter extends Prompter<string> {
    
    constructor(public readonly inputBox: DataInputBox) {
        super(inputBox)
    }

    public async prompt(): Promise<PromptResult<string>> {
        const promptPromise = promptUser({
            inputBox: this.inputBox,
            onDidTriggerButton: (button, resolve, reject) => {
                button.onClick(arg => resolve(arg), reject)
            },
        })
        this.show()

        return this.applyAfterCallbacks(await promptPromise)
    }

    public setLastResponse(picked: string): void {
        this.inputBox.value = picked
    }

    public getLastResponse(): string | undefined {
        return ''
    }
}

// TODO: rewrite the comment and remove the export
/**
 * Convenience method to allow the InputBox to be treated more like a dialog.
 *
 * This method shows the input box, and returns after the user enters a value, or cancels.
 * (Accepted = the user typed in a value and hit Enter, Cancelled = hide() is called or Esc is pressed)
 *
 * @param inputBox The InputBox to prompt the user with
 * @param onDidTriggerButton Optional event to trigger when the input box encounters a "Button Pressed" event.
 *  Buttons do not automatically cancel/accept the input box, caller must explicitly do this if intended.
 *
 * @returns If the InputBox was cancelled, undefined is returned. Otherwise, the string entered is returned.
 */
export async function promptUser({
    inputBox,
    onValidateInput,
    onDidTriggerButton,
}: {
    inputBox: DataInputBox
    onValidateInput?(value: string): string | undefined
    onDidTriggerButton?(
        button: InputBoxButton,
        resolve: (value: PromptResult<string>) => void,
        reject: (reason?: any) => void
    ): void
}): Promise<PromptResult<string>> {
    const disposables: vscode.Disposable[] = []

    try {
        const response = await new Promise<PromptResult<string>>((resolve, reject) => {
            inputBox.onDidAccept(
                () => {
                    if (!inputBox.validationMessage) {
                        resolve(inputBox.value)
                    }
                },
                inputBox,
                disposables
            )

            inputBox.onDidHide(
                () => {
                    resolve(undefined)
                },
                inputBox,
                disposables
            )

            if (onValidateInput) {
                inputBox.onDidChangeValue(
                    value => {
                        inputBox.validationMessage = onValidateInput(value)
                    },
                    inputBox,
                    disposables
                )
            }

            if (onDidTriggerButton) {
                inputBox.onDidTriggerButton(
                    (btn: vscode.QuickInputButton) => onDidTriggerButton(btn as InputBoxButton, resolve, reject),
                    inputBox,
                    disposables
                )
            }
        })

        return response
    } finally {
        disposables.forEach(d => d.dispose() as void)
        inputBox.hide()
    }
}
