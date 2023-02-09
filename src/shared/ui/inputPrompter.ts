/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { assign } from '../utilities/collectionUtils'
import { isValidResponse, StepEstimator, WIZARD_BACK, WIZARD_EXIT } from '../wizards/wizard'
import { QuickInputButton, PrompterButtons } from './buttons'
import { Prompter, PromptResult } from './prompter'

// TODO: allow `validateInput` to return a Thenable so we don't need to omit it from the options
/** Additional options to configure the `InputBox` beyond the standard API */
export type ExtendedInputBoxOptions = Omit<vscode.InputBoxOptions, 'validateInput' | 'placeHolder'> & {
    title?: string
    step?: number
    placeholder?: string
    totalSteps?: number
    buttons?: PrompterButtons<string>
    validateInput?(value: string): string | undefined
}

export type InputBox = Omit<vscode.InputBox, 'buttons'> & { buttons: PrompterButtons<string> }

export const defaultInputboxOptions: vscode.InputBoxOptions = {
    ignoreFocusOut: true,
}

/**
 * Creates a new input box UI element.
 *
 * @param options Customizes the InputBox and InputBoxPrompter.
 * @returns An {@link InputBoxPrompter}. This can be used directly with the `prompt` method or can be fed into a Wizard.
 */
export function createInputBox(options?: ExtendedInputBoxOptions): InputBoxPrompter {
    const inputBox = vscode.window.createInputBox() as InputBox
    assign({ ...defaultInputboxOptions, ...options }, inputBox)
    inputBox.buttons = options?.buttons ?? []

    const prompter = new InputBoxPrompter(inputBox)

    if (options?.validateInput !== undefined) {
        prompter.setValidation(input => options.validateInput!(input))
    }

    return prompter
}

export async function showInputBox(options?: ExtendedInputBoxOptions): Promise<string | undefined> {
    const prompter = createInputBox(options)
    const response = await prompter.prompt()

    return isValidResponse(response) ? response : undefined
}

/**
 * UI element that accepts user-inputted text. Wraps around {@link vscode.InputBox InputBox}.
 *
 * See {@link createInputBox} for easy creation of instances of this class.
 */
export class InputBoxPrompter extends Prompter<string> {
    private _lastResponse?: string
    private validateEvents: vscode.Disposable[] = []

    public set recentItem(response: string | undefined) {
        this._lastResponse = typeof response === 'string' ? response : this._lastResponse
        this.inputBox.value = this._lastResponse ?? ''
    }

    public get recentItem(): string | undefined {
        return this._lastResponse
    }

    constructor(public readonly inputBox: InputBox, protected readonly options: ExtendedInputBoxOptions = {}) {
        super()
    }

    public setSteps(current: number, total: number): void {
        this.inputBox.step = current
        this.inputBox.totalSteps = total
    }

    /**
     * Sets a validation hook into the InputBox, checking whenever the input changes or when the user
     * attempts to submit their response.
     *
     * @param validate Validator function
     */
    public setValidation(validate: (value: string) => string | undefined): void {
        this.validateEvents.forEach(d => d.dispose())
        this.validateEvents = []

        this.inputBox.onDidChangeValue(
            value => (this.inputBox.validationMessage = validate(value)),
            undefined,
            this.validateEvents
        )
        this.inputBox.onDidAccept(
            () => (this.inputBox.validationMessage = validate(this.inputBox.value)),
            undefined,
            this.validateEvents
        )
    }

    protected async promptUser(): Promise<PromptResult<string>> {
        const promptPromise = new Promise<PromptResult<string>>(resolve => {
            this.inputBox.onDidAccept(() => {
                this.recentItem = this.inputBox.value
                if (!this.inputBox.validationMessage) {
                    resolve(this.inputBox.value)
                }
            })
            this.inputBox.onDidHide(() => resolve(WIZARD_EXIT))
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
        }).finally(() => {
            // TODO: remove the .hide() call when Cloud9 implements dispose
            this.inputBox.hide()
            this.inputBox.dispose()
        })

        return await promptPromise
    }

    public setStepEstimator(estimator: StepEstimator<string>): void {
        // TODO: implement this
    }
}
