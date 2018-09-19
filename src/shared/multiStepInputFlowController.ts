/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 */

'use strict'

import { Disposable, QuickInput, QuickInputButton, QuickInputButtons, QuickPickItem, window } from 'vscode'

// Taken from the VSCode QuickInput sample, coordinates flows through
// a multi-step input sequence.

class InputFlowAction {
    private constructor() { }
    static back = new InputFlowAction()
    static cancel = new InputFlowAction()
    static resume = new InputFlowAction()
}

type InputStep = (input: MultiStepInputFlowController) => Thenable<InputStep | void>

interface QuickPickParameters<T extends QuickPickItem> {
    title: string
    step: number
    totalSteps: number
    items: T[]
    activeItem?: T
    placeholder: string
    buttons?: QuickInputButton[]
    shouldResume: () => Thenable<boolean>
}

interface InputBoxParameters {
    title: string
    step: number
    totalSteps: number
    value: string
    prompt: string
    validate: (value: string) => Promise<string | undefined>
    buttons?: QuickInputButton[]
    ignoreFocusOut?: boolean
    shouldResume: () => Thenable<boolean>
}

export class MultiStepInputFlowController {

    static async run<T>(start: InputStep) {
        const input = new MultiStepInputFlowController()
        return input.stepThrough(start)
    }

    private current?: QuickInput
    private steps: InputStep[] = []

    private async stepThrough<T>(start: InputStep) {
        let step: InputStep | void = start
        while (step) {
            this.steps.push(step)
            if (this.current) {
                this.current.enabled = false
                this.current.busy = true
            }
            try {
                step = await step(this)
            } catch (err) {
                if (err === InputFlowAction.back) {
                    this.steps.pop()
                    step = this.steps.pop()
                } else if (err === InputFlowAction.resume) {
                    step = this.steps.pop()
                } else if (err === InputFlowAction.cancel) {
                    step = undefined
                } else {
                    throw err
                }
            }
        }
        if (this.current) {
            this.current.dispose()
        }
    }

    async showQuickPick<T extends QuickPickItem, P extends QuickPickParameters<T>>({ title, step, totalSteps, items, activeItem, placeholder, buttons, shouldResume }: P) {
        const disposables: Disposable[] = []
        try {
            return await new Promise<T | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
                const input = window.createQuickPick<T>()
                input.title = title
                input.step = step
                input.totalSteps = totalSteps
                input.placeholder = placeholder
                input.items = items
                if (activeItem) {
                    input.activeItems = [activeItem]
                }
                input.buttons = [
                    ...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
                    ...(buttons || [])
                ]
                disposables.push(
                    input.onDidTriggerButton(item => {
                        if (item === QuickInputButtons.Back) {
                            reject(InputFlowAction.back)
                        } else {
                            resolve(<any>item)
                        }
                    }),
                    input.onDidChangeSelection(items => resolve(items[0])),
                    input.onDidHide(() => {
                        (async () => {
                            reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel)
                        })()
                            .catch(reject)
                    })
                )
                if (this.current) {
                    this.current.dispose()
                }
                this.current = input
                this.current.show()
            })
        } finally {
            disposables.forEach(d => d.dispose())
        }
    }

    async showInputBox<P extends InputBoxParameters>({ title, step, totalSteps, value, prompt, validate, buttons, ignoreFocusOut, shouldResume }: P) {
        const disposables: Disposable[] = []
        try {
            return await new Promise<string | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
                const input = window.createInputBox()
                input.title = title
                input.step = step
                input.totalSteps = totalSteps
                input.value = value || ''
                input.prompt = prompt
                input.buttons = [
                    ...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
                    ...(buttons || [])
                ]
                input.ignoreFocusOut = ignoreFocusOut ? ignoreFocusOut : false
                let validating = validate('')
                disposables.push(
                    input.onDidTriggerButton(item => {
                        if (item === QuickInputButtons.Back) {
                            reject(InputFlowAction.back)
                        } else {
                            resolve(<any>item)
                        }
                    }),
                    input.onDidAccept(async () => {
                        const value = input.value
                        input.enabled = false
                        input.busy = true
                        if (!(await validate(value))) {
                            resolve(value)
                        }
                        input.enabled = true
                        input.busy = false
                    }),
                    input.onDidChangeValue(async text => {
                        const current = validate(text)
                        validating = current
                        const validationMessage = await current
                        if (current === validating) {
                            input.validationMessage = validationMessage
                        }
                    }),
                    input.onDidHide(() => {
                        (async () => {
                            reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel)
                        })()
                            .catch(reject)
                    })
                )
                if (this.current) {
                    this.current.dispose()
                }
                this.current = input
                this.current.show()
            })
        } finally {
            disposables.forEach(d => d.dispose())
        }
    }
}
