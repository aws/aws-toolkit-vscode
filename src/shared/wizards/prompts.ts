/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// A collection of prompt functions to be used with the StateMachineController

import { ExtendedState } from './stateController'
import * as vscode from 'vscode'
import * as picker from '../../shared/ui/picker'
import * as input from '../../shared/ui/input'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as os from 'os'

import { addCodiconToString } from '../utilities/textUtilities'
import { WIZARD_RETRY } from './wizard'

type MetadataQuickPickItem<T> = vscode.QuickPickItem & { metadata: T | (() => Promise<T | symbol>) | symbol }

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

type WizardQuickPick<T> = vscode.QuickPick<MetadataQuickPickItem<T>>
export class FolderQuickPickItem implements MetadataQuickPickItem<vscode.Uri> {
    public readonly label: string

    public constructor(private readonly folder: Folder | vscode.WorkspaceFolder) {
        this.label = addCodiconToString('root-folder-opened', folder.name)
    }

    public get metadata(): vscode.Uri {
        return this.folder.uri
    }
}

 export class BrowseFolderQuickPickItem implements MetadataQuickPickItem<vscode.Uri> {
    public alwaysShow: boolean = true

    public constructor(
        public readonly label: string, 
        public readonly detail: string,
        private readonly defaultUri: vscode.Uri = vscode.Uri.file(os.homedir())
    ) {}

    public get metadata(): () => Promise<vscode.Uri | symbol> {
        return async () => {
            const result = await vscode.window.showOpenDialog({
                defaultUri: this.defaultUri,
                openLabel: localize('AWS.samcli.initWizard.name.browse.openLabel', 'Open'),
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
            })

            if (!result || !result.length) {
                return WIZARD_RETRY
            }

            return result[0]
        }
    }
}

interface Folder {
    readonly uri: vscode.Uri
    readonly name: string
}

 export function createLocationPrompt(
    folders: Folder[]
): WizardQuickPick<vscode.Uri> {
    const browseLabel = 
        (folders && folders.length > 0) ?
        addCodiconToString(
            'folder-opened',
            localize('AWS.initWizard.location.select.folder', 'Select a different folder...')
        ) 
        : localize(
            'AWS.initWizard.location.select.folder.empty.workspace',
            'There are no workspace folders open. Select a folder...'
        )
    const items: MetadataQuickPickItem<vscode.Uri>[] = folders.map(f => new FolderQuickPickItem(f))
        
    items.push(
            new BrowseFolderQuickPickItem(
                browseLabel,
                localize(
                    'AWS.wizard.location.select.folder.detail',
                    'The selected folder will be added to the workspace.'
                ),
                (folders !== undefined && folders.length > 0) ? folders[0].uri : undefined,
            )
    )

    return picker.createQuickPick({
        options: {
            ignoreFocusOut: true,
            title: localize('AWS.wizard.location.prompt', 'Select a workspace folder for your new project'),
        },
        items: items,
            //...(additionalParams?.helpButton ? [additionalParams.helpButton.button] : []),
    })
}