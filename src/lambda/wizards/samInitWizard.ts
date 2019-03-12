/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as immutable from 'immutable'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { SamCliInitArgs } from '../../shared/sam/cli/samCliInit'
import * as input from '../../shared/ui/input'
import * as picker from '../../shared/ui/picker'
import * as lambdaRuntime from '../models/samLambdaRuntime'
import { MultiStepWizard, WizardStep } from '../wizards/multiStepWizard'

export interface CreateNewSamAppWizardContext {
    readonly lambdaRuntimes: immutable.Set<lambdaRuntime.SamLambdaRuntime>
    readonly workspaceFolders: vscode.WorkspaceFolder[] | undefined

    promptUserForRuntime(
        currRuntime?: lambdaRuntime.SamLambdaRuntime
    ): Promise<lambdaRuntime.SamLambdaRuntime | undefined>

    promptUserForLocation(): Promise<vscode.Uri | undefined>

    promptUserForName(): Promise<string | undefined>

    showInputBox(
        options?: vscode.InputBoxOptions,
        token?: vscode.CancellationToken
    ): Thenable<string | undefined>

    showOpenDialog(
        options: vscode.OpenDialogOptions
    ): Thenable<vscode.Uri[] | undefined>

    showQuickPick(
        items: string[] | Thenable<string[]>,
        options: vscode.QuickPickOptions & { canPickMany: true },
        token?: vscode.CancellationToken
    ): Thenable<string[] | undefined>
    showQuickPick(
        items: string[] | Thenable<string[]>,
        options?: vscode.QuickPickOptions,
        token?: vscode.CancellationToken
    ): Thenable<string | undefined>
    showQuickPick<T extends vscode.QuickPickItem>(
        items: T[] | Thenable<T[]>,
        options: vscode.QuickPickOptions & { canPickMany: true },
        token?: vscode.CancellationToken
    ): Thenable<T[] | undefined>
    showQuickPick<T extends vscode.QuickPickItem>(
        items: T[] | Thenable<T[]>,
        options?: vscode.QuickPickOptions,
        token?: vscode.CancellationToken
    ): Thenable<T | undefined>
}

class DefaultCreateNewSamAppWizardContext implements CreateNewSamAppWizardContext {
    public readonly lambdaRuntimes = lambdaRuntime.samLambdaRuntimes
    public readonly showInputBox = vscode.window.showInputBox
    public readonly showOpenDialog = vscode.window.showOpenDialog
    public readonly showQuickPick = vscode.window.showQuickPick

    public get workspaceFolders(): vscode.WorkspaceFolder[] | undefined {
        return vscode.workspace.workspaceFolders
    }

    public async promptUserForRuntime(
        currRuntime?: lambdaRuntime.SamLambdaRuntime
    ): Promise<lambdaRuntime.SamLambdaRuntime | undefined> {

        const quickPick = await picker.createQuickPick<vscode.QuickPickItem>({
            options: {
                ignoreFocusOut: true,
                placeHolder: localize(
                    'AWS.samcli.initWizard.runtime.prompt',
                    'Select a SAM Application Runtime'
                ),
                value: String(currRuntime) || ''
            },
            items: lambdaRuntime.samLambdaRuntimes
                .toArray()
                .sort()
                .map(runtime => ({
                    label: runtime,
                    alwaysShow: runtime === currRuntime,
                    description: runtime === currRuntime ?
                        localize('AWS.samcli.deploy.region.previousRegion', 'Selected Previously') : ''
                }))
        })

        const choices = await picker.promptUser({
            picker: quickPick
        })

        if (!choices || choices.length === 0) {
            return undefined
        }

        if (choices.length > 1) {
            console.error(
                `Received ${choices.length} responses from user, expected 1.` +
                ' Cancelling to prevent deployment of unexpected template.'
            )

            return undefined
        }

        return choices[0].label as lambdaRuntime.SamLambdaRuntime
    }

    public async promptUserForLocation(): Promise<vscode.Uri | undefined> {
        const items: FolderQuickPickItem[] = (this.workspaceFolders || [])
            .map<FolderQuickPickItem>(f => new WorkspaceFolderQuickPickItem(f))
            .concat([new BrowseFolderQuickPickItem(this)])

        const quickPick = await picker.createQuickPick({
            options: {
                ignoreFocusOut: true,
                placeHolder: localize(
                    'AWS.samcli.initWizard.location.prompt',
                    'Select a location for your new project'
                )
            },
            items: items,
            buttons: [
                vscode.QuickInputButtons.Back
            ]
        })

        const choices = await picker.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            }
        })

        if (!choices || choices.length === 0) {
            return undefined
        }

        if (choices.length > 1) {
            console.error(
                `Received ${choices.length} responses from user, expected 1.` +
                ' Cancelling to prevent deployment of unexpected template.'
            )

            return undefined
        }

        return choices[0].getUri()
    }

    public async promptUserForName(): Promise<string | undefined> {
        const inputBox = await input.createInputBox({
            options: {
                title: '',
                prompt: localize(
                    'AWS.samcli.initWizard.name.prompt',
                    'Choose a name for your new application'
                ),
                placeHolder: localize(
                    'AWS.samcli.initWizard.name.placeholder',
                    'application name'
                ),
                ignoreFocusOut: true,
            },
            buttons: [
                vscode.QuickInputButtons.Back
            ]
        })

        return await input.promptUser({
            inputBox: inputBox,
            onValidateInput: (value: string) => {
                if (!value) {
                    return localize(
                        'AWS.samcli.initWizard.name.error.empty',
                        'Application name cannot be empty'
                    )
                }

                if (value.includes(path.sep)) {
                    return localize(
                        'AWS.samcli.initWizard.name.error.pathSep',
                        'The path separator ({0}) is not allowed in application names',
                        path.sep
                    )
                }

                return undefined
            },
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            }
        })
    }
}

export class CreateNewSamAppWizard extends MultiStepWizard<SamCliInitArgs> {
    private runtime?: lambdaRuntime.SamLambdaRuntime
    private location?: vscode.Uri
    private name?: string

    public constructor(
        private readonly context: CreateNewSamAppWizardContext = new DefaultCreateNewSamAppWizardContext()
    ) {
        super()
    }

    protected get startStep() {
        return this.RUNTIME
    }

    protected getResult(): SamCliInitArgs | undefined {
        if (!this.runtime || !this.location || !this.name) {
            return undefined
        }

        return {
            runtime: this.runtime,
            location: this.location,
            name: this.name
        }
    }

    private readonly RUNTIME: WizardStep = async () => {
        this.runtime = await this.context.promptUserForRuntime(this.runtime)

        return this.runtime ? this.LOCATION : undefined
    }

    private readonly LOCATION: WizardStep = async () => {
        this.location = await this.context.promptUserForLocation()

        return this.location ? this.NAME : this.RUNTIME
    }

    private readonly NAME: WizardStep = async () => {
        this.name = await this.context.promptUserForName()

        return this.name ? undefined : this.LOCATION
    }
}

export interface FolderQuickPickItem extends vscode.QuickPickItem {
    getUri(): Thenable<vscode.Uri | undefined>
}

class WorkspaceFolderQuickPickItem implements FolderQuickPickItem {
    public readonly label: string

    public constructor(private readonly folder: vscode.WorkspaceFolder) {
        this.label = folder.name
    }

    public async getUri(): Promise<vscode.Uri | undefined> {
        return this.folder.uri
    }
}

class BrowseFolderQuickPickItem implements FolderQuickPickItem {
    public readonly label = localize(
        'AWS.samcli.initWizard.name.browse.label',
        'Browse...'
    )

    public constructor(
        private readonly context: CreateNewSamAppWizardContext
    ) {
    }

    public async getUri(): Promise<vscode.Uri | undefined> {
        const workspaceFolders = this.context.workspaceFolders
        const defaultUri = !!workspaceFolders && workspaceFolders.length > 0 ?
            workspaceFolders[0].uri :
            vscode.Uri.file(os.homedir())

        const result = await this.context.showOpenDialog({
            defaultUri,
            openLabel: localize(
                'AWS.samcli.initWizard.name.browse.openLabel',
                'Open'
            ),
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false
        })

        if (!result || !result.length) {
            return undefined
        }

        return result[0]
    }
}
