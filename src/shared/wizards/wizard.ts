/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as StateController from './stateController'
import * as vscode from 'vscode'
import * as picker from '../../shared/ui/picker'
import * as input from '../../shared/ui/input'

type QuickInputTypes<T> = string | T | T[] | symbol | undefined

interface PropertyOptions<TState> {
    //dependencies?: Map<string, (v: any) => boolean>
    /**
     * Applies a conditional function that is evaluated after every user-input if the property
     * is undefined or if the property is not queued up to be prompted. Upon returning true, the 
     * bound property will be added to the prompt queue.
     */
    showWhen?: (state: TState) => boolean
    /** Checks if an InputBox input is valid */
    validateInput?: (value: string) => string | undefined
    /**
     * Maps buttons to activation functions. Buttons are automatically added to the picker at runtime
     */
    buttonBinds?: Map<vscode.QuickInputButton, (resolve: any, reject: any) => void>
}

export type WizardQuickPickItem<T> =  T extends string 
    ? vscode.QuickPickItem & { metadata?: string | symbol | (() => Promise<string | symbol>) }
    : vscode.QuickPickItem & { metadata: T | symbol | (() => Promise<T | symbol>) }

type MetadataQuickPickItem<T> = vscode.QuickPickItem & { metadata?: T | symbol | (() => Promise<T | symbol>) }

export const WIZARD_RETRY = Symbol()

function isUserInput<T>(picked: QuickInputTypes<T> | undefined): boolean {
    return picked !== undefined && picked === picker.CUSTOM_USER_INPUT
}

function isRetry<T>(picked: QuickInputTypes<T> | undefined): boolean {
    return picked !== undefined && picked === WIZARD_RETRY
}

function isQuickPick<T>(prompter: any): prompter is vscode.QuickPick<MetadataQuickPickItem<T>> {
    return prompter !== undefined && prompter.items !== undefined
}

function isInputBox(prompter: any): prompter is vscode.InputBox {
    return prompter !== undefined && prompter.password !== undefined
}

type Prompter<T> = vscode.InputBox | vscode.QuickPick<MetadataQuickPickItem<T>> 
interface WizardFormElement<TProp, TState> {
    readonly value: TProp | undefined
    readonly bindPrompter: (getPrompter: (state: TState) => Prompter<TProp>, options?: PropertyOptions<TState>) => void
}

/**
 * Transforms an interface into a collection of WizardFormElements
 */
type WizardForm<T> = {
    [Property in keyof T]-?: T[Property] extends Record<string, unknown> 
        ? WizardFormElement<T[Property], WizardForm<T[Property]>>
        : WizardFormElement<T[Property], T>
}

type WizardSchema<T> = {
    [Property in keyof T]-?: T[Property] extends Record<string, unknown> 
        ? (boolean | WizardSchema<T[Property]>) : boolean
}

function writePath(obj: any, path: string[], value: any): void {
    if (path.length === 1) {
        return obj[path[0]] = value
    } else if (path.length > 1) {
        return writePath(obj[path.shift()!], path, value)
    }
    
    throw new Error('bad write path:')
}

function readPath(obj: any, path: string[]): any {
    if (path.length === 1) {
        return obj[path[0]]
    } else if (path.length > 1) {
        return readPath(obj[path.shift()!], path)
    }

    throw new Error('bad read path')
}

// You're a wizard, StateMachineController!
export abstract class Wizard<TState, TResult=TState> extends StateController.StateMachineController<TState> {
    private readonly formData = new Map<string, PropertyOptions<TState> & { boundStep?: StateController.StateStepFunction<TState> }>()
    protected readonly form!: WizardForm<TState> 
    public constructor(schema: WizardSchema<TState>, initState?: TState) {
        super({ initState })
        this.form = this.createWizardForm(schema)
    }

    public abstract run(): Promise<TResult | undefined>

    private createWizardForm(schema: WizardSchema<any>, path: string[] = []): WizardForm<TState> {
        const form = {}
        
        Object.entries(schema).forEach(([key, value]: [string, unknown]) => {
            const newPath = [...path, key]
            if (typeof value === 'object') {
                Object.assign(form, {
                  [key]: this.createWizardForm(value as WizardSchema<any>)  
                })
            } else {
                const element = {
                    bindPrompter: <T>(
                        prompterProvider: (form: TState) => Prompter<T>, 
                        options: PropertyOptions<TState> = {}
                    ) => {
                        const prop = newPath.join('.')
                        const boundStep = async (state: StateController.MachineState<TState>) => {
                            const response = await this.promptUser(state, prompterProvider(state), options)
                            writePath(state, newPath, response)
                            const steps = this.resolveNextSteps(state)
                            return { 
                                nextState: element.value === undefined ? undefined : state, 
                                nextSteps: steps, 
                                repeatStep: isRetry(response) 
                            }
                        }
                
                        this.formData.set(prop, { ...options, boundStep })
                
                        if (options.showWhen === undefined) {
                            this.addStep(boundStep)
                        }
                    }
                } as WizardFormElement<any, any>

                Object.defineProperty(element, 'value', {
                    get: () => readPath(this.getState(), newPath)
                })

                Object.assign(form, { [key]: element })
            }
        })

        return form as WizardForm<TState>
    }

    private resolveNextSteps(state: StateController.MachineState<TState>): StateController.StateBranch<TState> {
        const nextSteps: StateController.StateBranch<TState> = []
        this.formData.forEach((options, targetProp) => {
            if (options.showWhen !== undefined) {
                if (!this.containsStep(options.boundStep) && options.showWhen(state) === true) {
                    nextSteps.push(options.boundStep!)
                }
            }
        })
        return nextSteps
    } 

    private async promptUser<TProp>(
        state: StateController.MachineState<TState>, 
        prompter: Prompter<TProp>,
        options: PropertyOptions<TState>
    ): Promise<QuickInputTypes<TProp>> {
        prompter.step = state.currentStep
        prompter.totalSteps = state.totalSteps
        prompter.buttons = [...prompter.buttons, ...(options.buttonBinds?.keys() ?? []), vscode.QuickInputButtons.Back]
        const lastPicked = state.stepCache ? state.stepCache.picked : undefined

        let answer: string | MetadataQuickPickItem<TProp> | MetadataQuickPickItem<TProp>[] | undefined

        if (isQuickPick(prompter)) {
            prompter.value = isUserInput(lastPicked) ? lastPicked[0].description : undefined

            if (!isUserInput(lastPicked) && lastPicked !== undefined) {
                const pickedAsArray = Array.isArray(lastPicked) ? lastPicked : [lastPicked]
                prompter.activeItems = prompter.items.filter(item => pickedAsArray.map(item => item.label).includes(item.label))

                if (prompter.activeItems.length === 0) {
                    prompter.activeItems = [prompter.items[0]]
                }
            }

            const choices = await picker.promptUser({
                picker: prompter,
                onDidTriggerButton: (button, resolve, reject) => {
                    if (button === vscode.QuickInputButtons.Back) {
                        resolve(undefined)
                    } else if (options.buttonBinds !== undefined && options.buttonBinds.has(button)) {
                        options.buttonBinds.get(button)!(resolve, reject)
                    }
                },
            })

            if (prompter.canSelectMany !== true) {
                answer = choices !== undefined ? choices[0] : undefined
            } else {
                answer = choices
            }
        } else if (isInputBox(prompter)) {
            prompter.value = typeof lastPicked === 'string' ? lastPicked : prompter.value

            answer = await input.promptUser({
                inputBox: prompter,
                onValidateInput: options.validateInput,
                onDidTriggerButton: (button, resolve, reject) => {
                    if (button === vscode.QuickInputButtons.Back) {
                        resolve(undefined)
                    } else if (options.buttonBinds !== undefined && options.buttonBinds.has(button)) {
                        options.buttonBinds.get(button)!(resolve, reject)
                    }
                },
            })
        }

        if (answer !== undefined) {
            state.stepCache = { picked: answer }
        }

        const result = answer !== undefined 
            ? Array.isArray(answer) 
                ? answer.map(answer => answer.metadata ?? answer.label) 
                : typeof answer === 'string' ? answer : answer.metadata ?? answer.label
            : undefined

        if (result instanceof Function) {
            return await result()
        } else if (Array.isArray(result)) {
            result.forEach(element => {
                if (typeof element === 'symbol') {
                    return element
                }
            })
            return await Promise.all(result.map(async f => f instanceof Function ? await f() : f)) as TProp[]
        } else {
            return result
        }
    }
}