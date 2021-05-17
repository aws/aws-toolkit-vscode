/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// A collection of prompt functions to be used with the StateMachineController

import { ExtendedState } from './stateController'
import * as vscode from 'vscode'
import * as picker from '../../shared/ui/picker'
import * as input from '../../shared/ui/input'

type MetadataQuickPickItem<T> = vscode.QuickPickItem & { metadata: T | symbol }

function isUserInput<TProp>(results: MetadataQuickPickItem<TProp>[] | undefined): boolean {
    if (results !== undefined && results.length === 1) {
        return results[0].metadata === picker.CUSTOM_USER_INPUT
    }

    return false
}

type PromptQuickPickOptions<TProp> = {
    transformUserInput?: (input?: string) => TProp,
    buttons?: Map<
        vscode.QuickInputButton, 
        (resolve: (v: MetadataQuickPickItem<TProp>[] | undefined) => void, reject: (reason?: any) => void) => void
    >,
} & picker.ExtendedQuickPickOptions

export async function promptQuickPick<TProp>(
    items: MetadataQuickPickItem<TProp>[],
    options: PromptQuickPickOptions<TProp> = {}
): Promise<MetadataQuickPickItem<TProp | symbol>[] | undefined> {
    //const picked: MetadataQuickPickItem<any>[] = state.stepCache ? state.stepCache.picked : undefined
    //const isUserInput = picked && picked[0].metadata === picker.CUSTOM_USER_INPUT

    // TODO: undefined items will be inferred as a quick input by convention
    options.buttons = options.buttons ?? new Map()


    const quickPick = picker.createQuickPick<MetadataQuickPickItem<TProp>>({
        ...options,
        buttons: [...options.buttons.keys(), vscode.QuickInputButtons.Back],
        items: items,
    })

    const results = await picker.promptUser({
        picker: quickPick,
        onDidTriggerButton: (button, resolve, reject) => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve(undefined)
            } else if (options.buttons!.has(button)) {
                options.buttons!.get(button)!(resolve, reject)
            }
        },
    })
    
    if (isUserInput(results)) {
        return results!.slice(0, 0)
    } 

    return results
}

type PromptType = 'QuickPick' | 'InputBox'
interface GenericOptions {
    value?: string
    step?: number
    totalStep?: number
}

export function promptUser<TState extends ExtendedState, TProp>(
    type: 'QuickPick', 
    items: MetadataQuickPickItem<TProp>[], 
    options: PromptQuickPickOptions<TProp>
): Promise<TState | undefined>

export function promptUser<TState extends ExtendedState, TProp>(
    type: 'InputBox', 
    options?: PrompInputBoxOptions<TProp>,
): Promise<TState | undefined>

export async function promptUser<TState extends ExtendedState, TProp>(
    type: PromptType,
    arg1?: MetadataQuickPickItem<TProp>[] | PrompInputBoxOptions<TProp>,
    arg2?: PromptQuickPickOptions<TProp>,
): Promise<TState | undefined> {
    const lastPicked: MetadataQuickPickItem<any>[] = state.stepCache ? state.stepCache.picked : undefined
    const options = ((type === 'QuickPick' ? arg2 : arg1) ?? {}) as GenericOptions
    options

    return 
}

type PrompInputBoxOptions<TProp> = {
    onValidateInput?: (value: string) => string | undefined,
    buttons?: Map<
        vscode.QuickInputButton, 
        (resolve: (v: MetadataQuickPickItem<TProp>[] | undefined) => void, reject: (reason?: any) => void) => void
    >,
} & input.ExtendedInputBoxOptions

// mutates a state's property
//
// TODO: add capacity for default
// need to differentiate between user hitting enter with no defined quick pick versus back button
// technically can support multiple selections if the state property takes an array
// TODO: decouple the state mutation from prompting
export async function promptForPropertyWithQuickPick<TState extends ExtendedState, TProp>(
    state: TState,
    property: keyof TState | string,
    items?: MetadataQuickPickItem<TProp>[],
    transformUserInput?: (input?: string) => TProp,
    buttons: Map<vscode.QuickInputButton, (resolve: any, reject: any) => void> = new Map(),
    options?: picker.ExtendedQuickPickOptions
): Promise<TState | undefined> {
    const picked: MetadataQuickPickItem<any>[] = state.stepCache ? state.stepCache.picked : undefined
    const isUserInput = picked && picked[0].metadata === picker.CUSTOM_USER_INPUT

    // TODO: undefined items will be inferred as a quick input by convention

    const quickPick = picker.createQuickPick<MetadataQuickPickItem<TProp | symbol>>({
        options: {
            value: isUserInput ? picked[0].description! : undefined,
            step: state.currentStep,
            totalSteps: state.totalSteps,
            ...options,
        },
        buttons: [...buttons.keys(), vscode.QuickInputButtons.Back],
        items: items,
    })

    if (!isUserInput && items) {
        quickPick.activeItems = items.filter(item => picked?.map(item => item.label).includes(item.label))

        if (quickPick.activeItems.length === 0) {
            quickPick.activeItems = [quickPick.items[0]]
        }
    }

    const choices = await picker.promptUser({
        picker: quickPick,
        onDidTriggerButton: (button, resolve, reject) => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve(undefined)
            } else if (buttons.has(button)) {
                buttons.get(button)!(resolve, reject)
                // TODO: add URL option
                //vscode.env.openExternal(vscode.Uri.parse('https://github.com/aws/aws-toolkit-vscode'))
            }
        },
    })

    const choice = picker.verifySinglePickerOutput(choices)
    if (choice !== undefined) {
        state.stepCache = { picked: [choice] }
        if (transformUserInput && choice.metadata === picker.CUSTOM_USER_INPUT) {
            Object.defineProperty(state, property, {
                value: transformUserInput(choice.description),
                enumerable: true,
                configurable: true,
            })
        } else {
            Object.defineProperty(state, property, { value: choice.metadata, enumerable: true, configurable: true })
        }
    }

    return choice ? state : undefined
}

export async function promptForPropertyWithInputBox<
    TState extends ExtendedState
>(
    state: TState,
    property: keyof TState,
    onValidateInput?: (value: string) => string | undefined,
    buttons: Map<vscode.QuickInputButton, (resolve: any, reject: any) => void> = new Map(),
    options?: input.ExtendedInputBoxOptions
): Promise<TState | undefined> {
    const picked: MetadataQuickPickItem<any>[] = state.stepCache ? state.stepCache.picked : undefined

    const inputBox = input.createInputBox({
        options: {
            value: picked ? picked[0].label : undefined,
            step: state.currentStep,
            totalSteps: state.totalSteps,
            ...options,
        },
        buttons: [...buttons.keys(), vscode.QuickInputButtons.Back],
    })

    const userInput = await input.promptUser({
        inputBox: inputBox,
        onValidateInput: onValidateInput,
        onDidTriggerButton: (button, resolve, reject) => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve(undefined)
            } else if (buttons.has(button)) {
                buttons.get(button)!(resolve, reject)
            }
        },
    })

    if (userInput !== undefined) {
        state.stepCache = { picked: [{ label: userInput }] }
        Object.defineProperty(state, property, { value: userInput, enumerable: true, configurable: true })
    }

    return userInput ? state : undefined
}

/**
 * Abstract idea for QuickPick/InputBox wizards (JSON):
 * "state": {
 *    "key1": ""
 *    "key2": ""
 * }
 * "steps": [
 *      
 * ]
 */