/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// A collection of prompt functions to be used with the StateMachineController

import { ExtendedState } from './stateController'
import * as vscode from 'vscode'

// mutates a state's property
//
// TODO: add capacity for default
// need to differentiate between user hitting enter with no defined quick pick versus back button
// technically can support multiple selections if the state property takes an array
// TODO: picked data needs to be scrubbed upon reaching a new state (have step-specific state information??)
async function promptForProperty<TState extends ExtendedState, TProp>(
    state: TState,
    property: keyof TState | string,
    items?: MetadataQuickPickItem<TProp>[],
    transformUserInput?: (input?: string) => TProp,
    options?: ExtendedQuickPickOptions
): Promise<TState | undefined> {
    const picked: MetadataQuickPickItem<any>[] = state.stepCache ? state.stepCache.picked : undefined
    const isUserInput = picked && picked[0].metadata === CUSTOM_USER_INPUT

    // TODO: undefined items will be inferred as a quick input by convention

    const quickPick = createQuickPick<MetadataQuickPickItem<TProp | symbol>>({
        options: {
            value: isUserInput ? picked[0].description! : undefined,
            step: state.currentStep,
            totalSteps: state.totalSteps,
            ...options,
        },
        buttons: [state.helpButton, vscode.QuickInputButtons.Back],
        items: items,
    })

    if (!isUserInput && items) {
        quickPick.activeItems = items.filter(item => picked?.map(item => item.label).includes(item.label))

        if (quickPick.activeItems.length === 0) {
            quickPick.activeItems = [quickPick.items[0]]
        }
    }

    const choices = await promptUser({
        picker: quickPick,
        onDidTriggerButton: (button, resolve, reject) => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve(undefined)
            } else if (button === state.helpButton) {
                // TODO: add URL option
                vscode.env.openExternal(vscode.Uri.parse('https://github.com/aws/aws-toolkit-vscode'))
            }
        },
    })

    const choice = verifySinglePickerOutput(choices)
    if (choice !== undefined) {
        state.stepCache = { picked: [choice] }
        if (transformUserInput && choice.metadata === CUSTOM_USER_INPUT) {
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
    TState extends ExtendedMachineState & { helpButton: vscode.QuickInputButton }
>(
    state: TState,
    property: keyof TState,
    onValidateInput?: (value: string) => string | undefined,
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
        buttons: [state.helpButton, vscode.QuickInputButtons.Back],
    })

    const userInput = await input.promptUser({
        inputBox: inputBox,
        onValidateInput: onValidateInput,
        onDidTriggerButton: (button, resolve, reject) => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve(undefined)
            } else if (button === state.helpButton) {
                // TODO: add URL
                vscode.env.openExternal(vscode.Uri.parse(''))
            }
        },
    })

    if (userInput !== undefined) {
        state.stepCache = { picked: [{ label: userInput }] }
        Object.defineProperty(state, property, { value: userInput, enumerable: true, configurable: true })
    }

    return userInput ? state : undefined
}