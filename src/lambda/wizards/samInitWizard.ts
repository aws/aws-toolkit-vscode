/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { Credentials } from 'aws-sdk'
import { Runtime } from 'aws-sdk/clients/lambda'
import { Set } from 'immutable'
import * as path from 'path'
import * as vscode from 'vscode'
import { SchemasDataProvider } from '../../eventSchemas/providers/schemasDataProvider'
import { SchemaClient } from '../../shared/clients/schemaClient'
import { eventBridgeSchemasDocUrl, samInitDocUrl } from '../../shared/constants'
import { ext } from '../../shared/extensionGlobals'
import { Region } from '../../shared/regions/endpoints'
import { createHelpButton } from '../../shared/ui/buttons'
import * as input from '../../shared/ui/input'
import * as picker from '../../shared/ui/picker'
import {
    BrowseFolderQuickPickItem,
    FolderQuickPickItem,
    MultiStepWizard,
    WizardContext,
    WizardStep,
    WorkspaceFolderQuickPickItem,
} from '../../shared/wizards/multiStepWizard'
import { compareSamLambdaRuntime, samLambdaRuntimes } from '../models/samLambdaRuntime'
import {
    eventBridgeStarterAppTemplate,
    getSamTemplateWizardOption,
    getTemplateDescription,
    repromptUserForTemplate,
    SamTemplate,
} from '../models/samTemplates'

export interface CreateNewSamAppWizardContext {
    readonly lambdaRuntimes: Set<Runtime>
    readonly workspaceFolders: ReadonlyArray<vscode.WorkspaceFolder> | undefined

    promptUserForRuntime(currRuntime?: Runtime): Promise<Runtime | undefined>
    promptUserForTemplate(currRuntime: Runtime, currTemplate?: SamTemplate): Promise<SamTemplate | undefined>

    promptUserForRegion(currRegion?: string): Promise<string | undefined>
    promptUserForRegistry(currRegion: string, currRegistry?: string): Promise<string | undefined>
    promptUserForSchema(currRegion: string, currRegistry: string, currSchema?: string): Promise<string | undefined>

    promptUserForLocation(): Promise<vscode.Uri | undefined>
    promptUserForName(defaultValue: string): Promise<string | undefined>

    showOpenDialog(options: vscode.OpenDialogOptions): Thenable<vscode.Uri[] | undefined>
}

export class DefaultCreateNewSamAppWizardContext extends WizardContext implements CreateNewSamAppWizardContext {
    // Filter out node8 until local debugging is no longer supported, and it can be removed from samLambdaRuntimes
    public readonly lambdaRuntimes = samLambdaRuntimes.filter(runtime => runtime !== 'nodejs8.10')
    private readonly helpButton = createHelpButton(localize('AWS.command.help', 'View Documentation'))
    private readonly currentCredentials: Credentials | undefined
    private readonly schemasRegions: Region[]

    public constructor(currentCredentials: Credentials | undefined, schemasRegions: Region[]) {
        super()
        this.currentCredentials = currentCredentials
        this.schemasRegions = schemasRegions
    }

    public async promptUserForRuntime(currRuntime?: Runtime): Promise<Runtime | undefined> {
        const quickPick = picker.createQuickPick<vscode.QuickPickItem>({
            options: {
                ignoreFocusOut: true,
                title: localize('AWS.samcli.initWizard.runtime.prompt', 'Select a SAM Application Runtime'),
                value: currRuntime ? currRuntime : '',
            },
            buttons: [this.helpButton, vscode.QuickInputButtons.Back],
            items: this.lambdaRuntimes
                .toArray()
                .sort(compareSamLambdaRuntime)
                .map(runtime => ({
                    label: runtime,
                    alwaysShow: runtime === currRuntime,
                    description:
                        runtime === currRuntime ? localize('AWS.wizard.selectedPreviously', 'Selected Previously') : '',
                })),
        })

        const choices = await picker.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                } else if (button === this.helpButton) {
                    vscode.env.openExternal(vscode.Uri.parse(samInitDocUrl))
                }
            },
        })
        const val = picker.verifySinglePickerOutput(choices)

        return val ? (val.label as Runtime) : undefined
    }

    public async promptUserForTemplate(
        currRuntime: Runtime,
        currTemplate?: SamTemplate
    ): Promise<SamTemplate | undefined> {
        const templates = getSamTemplateWizardOption(currRuntime)
        const quickPick = picker.createQuickPick<vscode.QuickPickItem>({
            options: {
                ignoreFocusOut: true,
                title: localize('AWS.samcli.initWizard.template.prompt', 'Select a SAM Application Template'),
                value: currTemplate,
            },
            buttons: [this.helpButton, vscode.QuickInputButtons.Back],
            items: templates.toArray().map(template => ({
                label: template,
                alwaysShow: template === currTemplate,
                detail:
                    template === currTemplate
                        ? localize('AWS.wizard.selectedPreviously', 'Selected Previously')
                        : getTemplateDescription(template),
            })),
        })

        const choices = await picker.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                } else if (button === this.helpButton) {
                    vscode.env.openExternal(vscode.Uri.parse(samInitDocUrl))
                }
            },
        })
        const val = picker.verifySinglePickerOutput(choices)

        //eventBridgeStarterAppTemplate requires aws credentials
        if (val && val.label === eventBridgeStarterAppTemplate) {
            if (!this.currentCredentials) {
                vscode.window.showInformationMessage(
                    localize(
                        'AWS.message.info.schemas.downloadCodeBindings.generate',
                        'You need to be connected to AWS to select {0}.',
                        val.label
                    )
                )

                return repromptUserForTemplate
            }
        }

        return val ? (val.label as SamTemplate) : undefined
    }

    public async promptUserForRegion(currRegion?: string): Promise<string | undefined> {
        const quickPick = picker.createQuickPick<vscode.QuickPickItem>({
            options: {
                ignoreFocusOut: true,
                title: localize('AWS.samcli.initWizard.schemas.region.prompt', 'Select an EventBridge Schemas Region'),
                value: currRegion ? currRegion : '',
            },
            buttons: [this.helpButton, vscode.QuickInputButtons.Back],
            items: this.schemasRegions.map(region => ({
                label: region.name,
                detail: region.id,
                alwaysShow: region.id === currRegion,
                description:
                    region.id === currRegion ? localize('AWS.wizard.selectedPreviously', 'Selected Previously') : '',
            })),
        })

        const choices = await picker.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                } else if (button === this.helpButton) {
                    vscode.env.openExternal(vscode.Uri.parse(eventBridgeSchemasDocUrl))
                }
            },
        })
        const val = picker.verifySinglePickerOutput(choices)

        return val ? (val.detail as string) : undefined
    }

    public async promptUserForRegistry(currRegion: string, currRegistry?: string): Promise<string | undefined> {
        const client: SchemaClient = ext.toolkitClientBuilder.createSchemaClient(currRegion)
        const registryNames = await SchemasDataProvider.getInstance().getRegistries(
            currRegion,
            client,
            this.currentCredentials!
        )

        if (!registryNames) {
            vscode.window.showInformationMessage(
                localize('AWS.samcli.initWizard.schemas.registry.failed_to_load_resources', 'Error loading registries.')
            )

            return undefined
        }

        const quickPick = picker.createQuickPick<vscode.QuickPickItem>({
            options: {
                ignoreFocusOut: true,
                title: localize('AWS.samcli.initWizard.schemas.registry.prompt', 'Select a Registry'),
                value: currRegistry ? currRegistry : '',
            },
            buttons: [this.helpButton, vscode.QuickInputButtons.Back],
            items: registryNames!.map(registry => ({
                label: registry,
                alwaysShow: registry === currRegistry,
                description:
                    registry === currRegistry ? localize('AWS.wizard.selectedPreviously', 'Selected Previously') : '',
            })),
        })

        const choices = await picker.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                } else if (button === this.helpButton) {
                    vscode.env.openExternal(vscode.Uri.parse(eventBridgeSchemasDocUrl))
                }
            },
        })
        const val = picker.verifySinglePickerOutput(choices)

        return val ? val.label : undefined
    }

    public async promptUserForSchema(
        currRegion: string,
        currRegistry: string,
        currSchema?: string
    ): Promise<string | undefined> {
        const client: SchemaClient = ext.toolkitClientBuilder.createSchemaClient(currRegion)
        const schemas = await SchemasDataProvider.getInstance().getSchemas(
            currRegion,
            currRegistry,
            client,
            this.currentCredentials!
        )

        if (!schemas) {
            vscode.window.showInformationMessage(
                localize(
                    'AWS.samcli.initWizard.schemas.failed_to_load_resources',
                    'Error loading schemas in registry {0}.',
                    currRegistry
                )
            )

            return undefined
        }

        if (schemas!.length === 0) {
            vscode.window.showInformationMessage(
                localize('AWS.samcli.initWizard.schemas.notFound"', 'No schemas found in registry {0}.', currRegistry)
            )

            return undefined
        }

        const quickPick = picker.createQuickPick<vscode.QuickPickItem>({
            options: {
                ignoreFocusOut: true,
                title: localize('AWS.samcli.initWizard.schemas.schema.prompt', 'Select a Schema'),
                value: currSchema ? currSchema : '',
            },
            buttons: [this.helpButton, vscode.QuickInputButtons.Back],
            items: schemas!.map(schema => ({
                label: schema.SchemaName!,
                alwaysShow: schema.SchemaName === currSchema,
                description:
                    schema === currSchema ? localize('AWS.wizard.selectedPreviously', 'Selected Previously') : '',
            })),
        })

        const choices = await picker.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                } else if (button === this.helpButton) {
                    vscode.env.openExternal(vscode.Uri.parse(eventBridgeSchemasDocUrl))
                }
            },
        })
        const val = picker.verifySinglePickerOutput(choices)

        return val ? val.label : undefined
    }

    public async promptUserForLocation(): Promise<vscode.Uri | undefined> {
        const items: FolderQuickPickItem[] = (this.workspaceFolders || [])
            .map<FolderQuickPickItem>(f => new WorkspaceFolderQuickPickItem(f))
            .concat([
                new BrowseFolderQuickPickItem(
                    this,
                    localize(
                        'AWS.samcli.initWizard.location.prompt',
                        'The folder you select will be added to your VS Code workspace.'
                    )
                ),
            ])

        const quickPick = picker.createQuickPick({
            options: {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.samcli.initWizard.location.prompt',
                    'Select a workspace folder for your new project'
                ),
            },
            items: items,
            buttons: [this.helpButton, vscode.QuickInputButtons.Back],
        })

        const choices = await picker.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                } else if (button === this.helpButton) {
                    vscode.env.openExternal(vscode.Uri.parse(samInitDocUrl))
                }
            },
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

    public async promptUserForName(defaultValue: string): Promise<string | undefined> {
        const inputBox = input.createInputBox({
            options: {
                title: localize('AWS.samcli.initWizard.name.prompt', 'Enter a name for your new application'),
                ignoreFocusOut: true,
            },
            buttons: [this.helpButton, vscode.QuickInputButtons.Back],
        })
        inputBox.value = defaultValue

        return input.promptUser({
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
            },
        })
    }
}

export interface CreateNewSamAppWizardResponse {
    runtime: Runtime
    template: SamTemplate
    region?: string
    registryName?: string
    schemaName?: string
    location: vscode.Uri
    name: string
}

export class CreateNewSamAppWizard extends MultiStepWizard<CreateNewSamAppWizardResponse> {
    private runtime?: Runtime
    private template?: SamTemplate
    private region?: string
    private registryName?: string
    private schemaName?: string
    private location?: vscode.Uri
    private name?: string

    public constructor(private readonly context: CreateNewSamAppWizardContext) {
        super()
    }

    protected get startStep() {
        return this.RUNTIME
    }

    protected getResult(): CreateNewSamAppWizardResponse | undefined {
        if (!this.runtime || !this.template || !this.location || !this.name) {
            return undefined
        }

        if (this.template === eventBridgeStarterAppTemplate) {
            if (!this.region || !this.schemaName || !this.registryName) {
                return undefined
            }
        }

        return {
            runtime: this.runtime,
            template: this.template,
            region: this.region,
            registryName: this.registryName,
            schemaName: this.schemaName,
            location: this.location,
            name: this.name,
        }
    }

    private readonly RUNTIME: WizardStep = async () => {
        this.runtime = await this.context.promptUserForRuntime(this.runtime)

        return this.runtime ? this.TEMPLATE : undefined
    }

    private readonly TEMPLATE: WizardStep = async () => {
        this.template = await this.context.promptUserForTemplate(this.runtime!)

        if (this.template === repromptUserForTemplate) {
            return this.TEMPLATE
        }
        if (this.template === eventBridgeStarterAppTemplate) {
            return this.REGION
        }

        return this.template ? this.LOCATION : this.RUNTIME
    }

    private readonly REGION: WizardStep = async () => {
        this.region = await this.context.promptUserForRegion()

        return this.region ? this.REGISTRY : this.TEMPLATE
    }

    private readonly REGISTRY: WizardStep = async () => {
        this.registryName = await this.context.promptUserForRegistry(this.region!)

        return this.registryName ? this.SCHEMA : this.REGION
    }

    private readonly SCHEMA: WizardStep = async () => {
        this.schemaName = await this.context.promptUserForSchema(this.region!, this.registryName!)

        return this.schemaName ? this.LOCATION : this.REGISTRY
    }

    private readonly LOCATION: WizardStep = async () => {
        this.location = await this.context.promptUserForLocation()

        if (!this.location) {
            if (this.template === eventBridgeStarterAppTemplate) {
                return this.SCHEMA
            }

            return this.TEMPLATE
        }

        return this.NAME
    }

    private readonly NAME: WizardStep = async () => {
        this.name = await this.context.promptUserForName(
            this.name ?? (this.location ? path.basename(this.location.path) : '')
        )

        return this.name ? undefined : this.LOCATION
    }
}
