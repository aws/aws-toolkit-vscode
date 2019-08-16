/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as immutable from 'immutable'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { samInitDocUrl } from '../../shared/constants'
import { createHelpButton } from '../../shared/ui/buttons'
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

    showOpenDialog(options: vscode.OpenDialogOptions): Thenable<vscode.Uri[] | undefined>
}

export class DefaultCreateNewSamAppWizardContext implements CreateNewSamAppWizardContext {
    public readonly lambdaRuntimes = lambdaRuntime.samLambdaRuntimes
    public readonly showOpenDialog = vscode.window.showOpenDialog
    private readonly helpButton = createHelpButton(this.extContext, localize('AWS.command.help', 'View Documentation'))

    public constructor(private readonly extContext: Pick<vscode.ExtensionContext, 'asAbsolutePath'>) {}

    public get workspaceFolders(): vscode.WorkspaceFolder[] | undefined {
        return vscode.workspace.workspaceFolders
    }

    public async promptUserForRuntime(
        currRuntime?: lambdaRuntime.SamLambdaRuntime
    ): Promise<lambdaRuntime.SamLambdaRuntime | undefined> {
        const quickPick = picker.createQuickPick<vscode.QuickPickItem>({
            options: {
                ignoreFocusOut: true,
                title: localize('AWS.samcli.initWizard.runtime.prompt', 'Select a SAM Application Runtime'),
                value: currRuntime ? currRuntime : ''
            },
            buttons: [this.helpButton, vscode.QuickInputButtons.Back],
            items: this.lambdaRuntimes
                .toArray()
                .sort(lambdaRuntime.compareSamLambdaRuntime)
                .map(runtime => ({
                    label: runtime,
                    alwaysShow: runtime === currRuntime,
                    description:
                        runtime === currRuntime
                            ? localize('AWS.samcli.wizard.selectedPreviously', 'Selected Previously')
                            : ''
                }))
        })

        const choices = await picker.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                } else if (button === this.helpButton) {
                    vscode.env.openExternal(vscode.Uri.parse(samInitDocUrl))
                }
            }
        })
        const val = picker.verifySinglePickerOutput(choices)

        return val ? (val.label as lambdaRuntime.SamLambdaRuntime) : undefined
    }

    public async promptUserForLocation(): Promise<vscode.Uri | undefined> {
        const items: FolderQuickPickItem[] = (this.workspaceFolders || [])
            .map<FolderQuickPickItem>(f => new WorkspaceFolderQuickPickItem(f))
            .concat([new BrowseFolderQuickPickItem(this)])

        const quickPick = picker.createQuickPick({
            options: {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.samcli.initWizard.location.prompt',
                    'Select a workspace folder for your new project'
                )
            },
            items: items,
            buttons: [this.helpButton, vscode.QuickInputButtons.Back]
        })

        const choices = await picker.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                } else if (button === this.helpButton) {
                    vscode.env.openExternal(vscode.Uri.parse(samInitDocUrl))
                }
            }
        })
        const pickerResponse = picker.verifySinglePickerOutput<FolderQuickPickItem>(choices)

        if (!pickerResponse) {
            return undefined
        }

        if (pickerResponse instanceof BrowseFolderQuickPickItem) {
            const browseFolderResult = await pickerResponse.getUri()

            // If user cancels from Open Folder dialog, send them back to the folder picker.
            return browseFolderResult ? browseFolderResult : this.promptUserForLocation()
        }

        return pickerResponse.getUri()
    }

    public async promptUserForName(): Promise<string | undefined> {
        const inputBox = input.createInputBox({
            options: {
                title: localize('AWS.samcli.initWizard.name.prompt', 'Enter a name for your new application'),
                ignoreFocusOut: true
            },
            buttons: [this.helpButton, vscode.QuickInputButtons.Back]
        })

        return await input.promptUser({
            inputBox: inputBox,
            onValidateInput: (value: string) => {
                if (!value) {
                    return localize('AWS.samcli.initWizard.name.error.empty', 'Application name cannot be empty')
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
                } else if (button === this.helpButton) {
                    vscode.env.openExternal(vscode.Uri.parse(samInitDocUrl))
                }
            }
        })
    }
}

export interface CreateNewSamAppWizardResponse {
    runtime: lambdaRuntime.SamLambdaRuntime
    location: vscode.Uri
    name: string
}

export class CreateNewSamAppWizard extends MultiStepWizard<CreateNewSamAppWizardResponse> {
    private runtime?: lambdaRuntime.SamLambdaRuntime
    private location?: vscode.Uri
    private name?: string

    public constructor(private readonly context: CreateNewSamAppWizardContext) {
        super()
    }

    protected get startStep() {
        return this.RUNTIME
    }

    protected getResult(): CreateNewSamAppWizardResponse | undefined {
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
    public alwaysShow: boolean = true

    public constructor(private readonly context: CreateNewSamAppWizardContext) {}

    public get label(): string {
        if (this.context.workspaceFolders && this.context.workspaceFolders.length > 0) {
            return localize('AWS.samcli.initWizard.location.select.folder', 'Select a different folder...')
        }

        return localize(
            'AWS.samcli.initWizard.location.select.folder.empty.workspace',
            'There are no workspace folders open. Select a folder...'
        )
    }

    public get detail(): string {
        return localize(
            'AWS.samcli.initWizard.location.select.folder.detail',
            'The folder you select will be added to your VS Code workspace.'
        )
    }

    public async getUri(): Promise<vscode.Uri | undefined> {
        const workspaceFolders = this.context.workspaceFolders
        const defaultUri =
            !!workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri : vscode.Uri.file(os.homedir())

        const result = await this.context.showOpenDialog({
            defaultUri,
            openLabel: localize('AWS.samcli.initWizard.name.browse.openLabel', 'Open'),
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
