/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { applyPrimitives } from '../utilities/collectionUtils'
import { WizardControl } from '../wizards/util'
import { StepEstimator } from '../wizards/wizard'
import { PrompterButtons } from './buttons'
import { PrompterConfiguration, PromptResult } from './prompter'
import { QuickInputPrompter } from './quickInput'

type InputBoxButtons = PrompterButtons<string, InputBoxPrompter>
/** Additional options to configure the `InputBox` beyond the standard API */
export type ExtendedInputBoxOptions = Omit<vscode.InputBoxOptions, 'validateInput' | 'placeHolder'> & {
    title?: string
    step?: number
    placeholder?: string
    totalSteps?: number
    buttons?: InputBoxButtons
    /** Validates the user's input. Falsy values show no message. */
    validateInput?(value: string): string | undefined | Promise<string | undefined>
}

export type InputBox = Omit<vscode.InputBox, 'buttons'> & { buttons: InputBoxButtons }

export const DEFAULT_INPUTBOX_OPTIONS: vscode.InputBoxOptions = {
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
    applyPrimitives(inputBox, { ...DEFAULT_INPUTBOX_OPTIONS, ...options })
    inputBox.buttons = options?.buttons ?? []

    const prompter = new InputBoxPrompter(inputBox)

    if (options?.validateInput !== undefined) {
        prompter.setValidation(input => options.validateInput!(input))
    }

    return prompter
}

/**
 * UI element that accepts user-inputted text. Wraps around {@link vscode.InputBox InputBox}.
 *
 * See {@link createInputBox} for easy creation of instances of this class.
 */
export class InputBoxPrompter extends QuickInputPrompter<string> {
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
        super(inputBox)
    }

    public override dispose() {
        this.validateEvents.forEach(d => d.dispose())
        super.dispose()
    }

    /**
     * Sets a validation hook into the InputBox, checking whenever the input changes or when the user
     * attempts to submit their response.
     *
     * @param validate Validator function
     */
    public setValidation(validate: (value: string) => string | undefined | Promise<string | undefined>): void {
        this.validateEvents.forEach(d => d.dispose())
        this.validateEvents = []

        const applyValidation = (value: string) => {
            const result = validate(value)
            if (result instanceof Promise) {
                // TODO: add test
                // also upstream a change to VS Code to support progress bar for InputBox
                this.addBusyUpdate(
                    result.then(message => {
                        this.inputBox.validationMessage = message
                    }),
                    true
                )
            } else {
                this.inputBox.validationMessage = result
            }
        }

        this.validateEvents.push(
            this.inputBox.onDidChangeValue(applyValidation, this.validateEvents),
            this.inputBox.onDidAccept(() => applyValidation(this.inputBox.value), this.validateEvents)
        )
    }

    protected async promptUser(config: PrompterConfiguration<string>): Promise<PromptResult<string>> {
        if (config.steps) {
            this.setSteps(config.steps.current, config.steps.total)
        }

        if (config.stepEstimator) {
            this.applyStepEstimator(config.stepEstimator)
        }

        const accept = (resolve: (value: PromptResult<string>) => void) => {
            this.recentItem = this.inputBox.value
            if (!this.inputBox.validationMessage) {
                resolve(this.inputBox.value)
            }
        }

        const promptPromise = new Promise<PromptResult<string>>(resolve => {
            this.inputBox.onDidAccept(() => accept(resolve))
            this.inputBox.onDidHide(() => resolve(WizardControl.Exit))
            this.inputBox.onDidTriggerButton(button => this.handleButton(button, resolve))
            this.show()
        }).finally(() => {
            // TODO: remove the .hide() call when Cloud9 implements dispose
            this.inputBox.hide()
        })

        const result = await promptPromise
        this._lastResponse = result instanceof WizardControl ? this._lastResponse : this._lastResponse

        if (Object.keys(config).length === 0) {
            this.dispose()
        } else {
            vscode.Disposable.from(...this.disposables).dispose()
        }

        return result
    }

    private applyStepEstimator(estimator: StepEstimator<string>): void {
        const { step, totalSteps } = this.inputBox
        const estimates: Record<string, number> = {}

        if (!step || !totalSteps) {
            return
        }

        const estimate = (value: string) => {
            if (this.inputBox.validationMessage) {
                return
            }
            estimates[value] ??= estimator(value)
            this.setSteps(step, totalSteps + estimates[value])
        }

        this.disposables.push(this.inputBox.onDidChangeValue(estimate))
    }
}
