/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import { Credentials } from 'aws-sdk'
import { Runtime } from 'aws-sdk/clients/lambda'
import { Set as ImmutableSet } from 'immutable'
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
    promptUserForLocation,
    WizardContext,
} from '../../shared/wizards/multiStepWizard'
import {
    createRuntimeQuickPick,
    DependencyManager,
    getDependencyManager,
    RuntimeFamily,
    RuntimePackageType,
    samLambdaCreatableRuntimes,
} from '../models/samLambdaRuntime'
import {
    eventBridgeStarterAppTemplate,
    getSamTemplateWizardOption,
    getTemplateDescription,
    repromptUserForTemplate,
    SamTemplate,
} from '../models/samTemplates'
import * as semver from 'semver'
import { MINIMUM_SAM_CLI_VERSION_INCLUSIVE_FOR_IMAGE_SUPPORT } from '../../shared/sam/cli/samCliValidator'
import * as fsutil from '../../shared/filesystemUtilities'
import { Wizard } from '../../shared/wizards/wizard'
import { createLocationPrompt } from '../../shared/wizards/prompts'
import { IteratorTransformer } from '../../shared/utilities/collectionUtils'

const localize = nls.loadMessageBundle()

export interface CreateNewSamAppWizardContext {
    readonly lambdaRuntimes: ImmutableSet<Runtime>
    readonly workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined

    promptUserForRuntimeAndDependencyManager(
        currRuntime?: Runtime
    ): Promise<[Runtime, RuntimePackageType, DependencyManager | undefined] | undefined>
    promptUserForTemplate(
        currRuntime: Runtime,
        packageType: RuntimePackageType,
        currTemplate?: SamTemplate
    ): Promise<SamTemplate | undefined>

    promptUserForRegion(currRegion?: string): Promise<string | undefined>
    promptUserForRegistry(currRegion: string, currRegistry?: string): Promise<string | undefined>
    promptUserForSchema(currRegion: string, currRegistry: string, currSchema?: string): Promise<string | undefined>

    promptUserForLocation(): Promise<vscode.Uri | undefined>
    promptUserForName(defaultValue: string): Promise<string | undefined>

    showOpenDialog(options: vscode.OpenDialogOptions): Thenable<vscode.Uri[] | undefined>
}

export class DefaultCreateNewSamAppWizardContext extends WizardContext implements CreateNewSamAppWizardContext {
    public readonly lambdaRuntimes = samLambdaCreatableRuntimes()
    private readonly helpButton = createHelpButton(localize('AWS.command.help', 'View Toolkit Documentation'))
    private readonly currentCredentials: Credentials | undefined
    private readonly schemasRegions: Region[]
    private readonly samCliVersion: string

    private readonly totalSteps: number = 4
    private stepsToAdd = { promptUserForDependencyManager: false, promptUserForRegion: false }
    private additionalSteps(): number {
        let n = 0
        if (this.stepsToAdd.promptUserForDependencyManager) {
            n += 1
        }
        if (this.stepsToAdd.promptUserForRegion) {
            n += 3
        }

        return n
    }

    public constructor(currentCredentials: Credentials | undefined, schemasRegions: Region[], samCliVersion: string) {
        super()
        this.currentCredentials = currentCredentials
        this.schemasRegions = schemasRegions
        this.samCliVersion = samCliVersion
    }

    public async promptUserForRuntimeAndDependencyManager(
        currRuntime?: Runtime
    ): Promise<[Runtime, RuntimePackageType, DependencyManager | undefined] | undefined> {
        // last common step; reset additionalSteps to 0
        this.stepsToAdd.promptUserForDependencyManager = false

        const quickPick = createRuntimeQuickPick({
            // TODO: remove check when SAM CLI version is low enough
            showImageRuntimes: semver.gte(this.samCliVersion, MINIMUM_SAM_CLI_VERSION_INCLUSIVE_FOR_IMAGE_SUPPORT),
            buttons: [this.helpButton],
            currRuntime,
            step: 1,
            totalSteps: this.totalSteps,
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

        if (!val) {
            return undefined
        }

        const dependencyManager = await this.promptUserForDependencyManager('')

        return val ? ['', 'Zip', dependencyManager] : undefined
    }

    // don't preinclude currDependencyManager because it won't make sense if transitioning between runtimes
    private async promptUserForDependencyManager(currRuntime: Runtime): Promise<DependencyManager | undefined> {
        const dependencyManagers = getDependencyManager(currRuntime)
        if (dependencyManagers.length === 1) {
            return dependencyManagers[0]
        } else {
            this.stepsToAdd.promptUserForDependencyManager = true
            const quickPick = picker.createQuickPick<vscode.QuickPickItem>({
                options: {
                    ignoreFocusOut: true,
                    title: localize('AWS.samcli.initWizard.dependencyManager.prompt', 'Select a Dependency Manager'),
                    step: 2,
                    totalSteps: this.totalSteps + this.additionalSteps(),
                },
                buttons: [this.helpButton, vscode.QuickInputButtons.Back],
                items: dependencyManagers.map(dependencyManager => ({
                    label: dependencyManager,
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

            return val ? (val.label as DependencyManager) : undefined
        }
    }

    public async promptUserForTemplate(
        currRuntime: Runtime,
        packageType: RuntimePackageType,
        currTemplate?: SamTemplate
    ): Promise<SamTemplate | undefined> {
        this.stepsToAdd.promptUserForRegion = false
        const templates = getSamTemplateWizardOption(currRuntime, packageType, this.samCliVersion)
        const quickPick = picker.createQuickPick<vscode.QuickPickItem>({
            options: {
                ignoreFocusOut: true,
                title: localize('AWS.samcli.initWizard.template.prompt', 'Select a SAM Application Template'),
                value: currTemplate,
                step: 2 + this.additionalSteps(),
                totalSteps: this.totalSteps + this.additionalSteps(),
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
        // start of longer path; set additionalSteps to 3
        this.stepsToAdd.promptUserForRegion = true
        const quickPick = picker.createQuickPick<vscode.QuickPickItem>({
            options: {
                ignoreFocusOut: true,
                title: localize('AWS.samcli.initWizard.schemas.region.prompt', 'Select an EventBridge Schemas Region'),
                value: currRegion ? currRegion : '',
                step: 3,
                totalSteps: this.totalSteps + this.additionalSteps(),
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
                step: 4,
                totalSteps: this.totalSteps + this.additionalSteps(),
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
                step: 4,
                totalSteps: this.totalSteps + this.additionalSteps(),
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
        return promptUserForLocation(this, {
            helpButton: { button: this.helpButton, url: samInitDocUrl },
            step: 3 + this.additionalSteps(),
            totalSteps: this.totalSteps + this.additionalSteps(),
        })
    }

    public async promptUserForName(defaultValue: string): Promise<string | undefined> {
        const inputBox = input.createInputBox({
            options: {
                title: localize('AWS.samcli.initWizard.name.prompt', 'Enter a name for your new application'),
                ignoreFocusOut: true,
                step: 4 + this.additionalSteps(),
                totalSteps: this.totalSteps + this.additionalSteps(),
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
    packageType: RuntimePackageType
    runtime: Runtime
    dependencyManager: DependencyManager
    template: SamTemplate
    region?: string
    registryName?: string
    schemaName?: string
    location: vscode.Uri
    name: string
}

export interface CreateNewSamAppWizardResponse2 {
    runtimeAndPackage: {
        packageType: RuntimePackageType
        runtime: Runtime
    }
    dependencyManager: DependencyManager
    template: SamTemplate
    region?: string
    registryName?: string
    schemaName?: string
    location: vscode.Uri
    name: string
}

function createTemplateQuickPick(
    currRuntime: Runtime,
    packageType: RuntimePackageType,
    samCliVersion: string,
    currTemplate?: SamTemplate
): vscode.QuickPick<MetadataQuickPickItem<SamTemplate>> {
    const templates = getSamTemplateWizardOption(currRuntime, packageType, samCliVersion)
    return picker.createQuickPick<MetadataQuickPickItem<SamTemplate>>({
        options: {
            ignoreFocusOut: true,
            title: localize('AWS.samcli.initWizard.template.prompt', 'Select a SAM Application Template'),
            value: currTemplate,
        },
        items: templates.toArray().map(template => ({
            label: template,
            metadata: template,
            detail: getTemplateDescription(template),
        })),
    })
}

function createRegionQuickPick(schemasRegions: Region[]): vscode.QuickPick<MetadataQuickPickItem<string>> {
    return picker.createQuickPick<MetadataQuickPickItem<string>>({
        options: {
            ignoreFocusOut: true,
            title: localize('AWS.samcli.initWizard.schemas.region.prompt', 'Select an EventBridge Schemas Region'),
        },
        items: schemasRegions.map(region => ({
            label: region.name,
            detail: region.id,
            metadata: region.id,
        })),
    })
}

type MetadataQuickPickItem<T> = vscode.QuickPickItem & { metadata?: T | symbol | (() => Promise<T | symbol>) }

function createManagerQuickPick(currRuntime: Runtime): vscode.QuickPick<MetadataQuickPickItem<DependencyManager>> {
    const dependencyManagers = getDependencyManager(currRuntime)

    return picker.createQuickPick({
        options: {
            ignoreFocusOut: true,
            title: localize('AWS.samcli.initWizard.dependencyManager.prompt', 'Select a Dependency Manager'),
        },
        items: dependencyManagers.map(dependencyManager => ({
            label: dependencyManager,
            metadata: dependencyManager,
        })),
    })
}

function createRegistryQuickPick(currRegion: string, currentCredentials: Credentials | undefined): vscode.QuickPick<MetadataQuickPickItem<string>> {
    const quickPicker = picker.createQuickPick({
        options: {
            ignoreFocusOut: true,
            title: localize('AWS.samcli.initWizard.schemas.registry.prompt', 'Select a Registry'),
        },
    })
    quickPicker.busy = true

    const client: SchemaClient = ext.toolkitClientBuilder.createSchemaClient(currRegion)
   SchemasDataProvider.getInstance().getRegistries(
        currRegion,
        client,
        currentCredentials!
    ).then(registryNames => {
        if (!registryNames) {
            vscode.window.showInformationMessage(
                localize('AWS.samcli.initWizard.schemas.registry.failed_to_load_resources', 'Error loading registries.')
            )

            //return undefined
        }

        quickPicker.items = registryNames!.map(registry => ({
            label: registry,
        }))

        quickPicker.busy = false
    })

    return quickPicker
}

function createSchemaQuickPick(
    currRegion: string,
    currRegistry: string,
    currentCredentials: Credentials | undefined
): vscode.QuickPick<MetadataQuickPickItem<string>> {
    const client: SchemaClient = ext.toolkitClientBuilder.createSchemaClient(currRegion)

    const quickPick = picker.createQuickPick<MetadataQuickPickItem<string>>({
        options: {
            ignoreFocusOut: true,
            title: localize('AWS.samcli.initWizard.schemas.schema.prompt', 'Select a Schema'),
        },
    })
    quickPick.busy = true

    SchemasDataProvider.getInstance().getSchemas(
        currRegion,
        currRegistry,
        client,
        currentCredentials!
    ).then(schemas => {

        if (!schemas) {
            vscode.window.showInformationMessage(
                localize(
                    'AWS.samcli.initWizard.schemas.failed_to_load_resources',
                    'Error loading schemas in registry {0}.',
                    currRegistry
                )
            )
        }

        if (schemas!.length === 0) {
            vscode.window.showInformationMessage(
                localize('AWS.samcli.initWizard.schemas.notFound"', 'No schemas found in registry {0}.', currRegistry)
            )
        }

        quickPick.items = schemas!.map(schema => ({
            label: schema.SchemaName!,
            metadata: schema.SchemaName,
        }))

        quickPick.busy = false
    })

    return quickPick
}

function validateName(value: string): string | undefined {
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
}

function createNameInputBox(defaultValue: string): vscode.InputBox {
    return input.createInputBox({
        options: {
            value: defaultValue,
            title: localize('AWS.samcli.initWizard.name.prompt', 'Enter a name for your new application'),
            ignoreFocusOut: true,
        },
    })
}

export class CreateNewSamAppWizard2 extends Wizard<CreateNewSamAppWizardResponse2, CreateNewSamAppWizardResponse> {
    public constructor(
        private readonly currentCredentials: Credentials | undefined, 
        private readonly schemasRegions: Region[], 
        private readonly samCliVersion: string
    ) {
        super({
            runtimeAndPackage: true,
            dependencyManager: true,
            template: true,
            region: true,
            registryName: true,
            schemaName: true,
            location: true,
            name: true,
        })

        // TODO: allow prompter provider to return undefined(?)
        // TODO: skip steps when the state has already been defined
        // TODO: add default values
        // TODO: add help Url that automatically creates the bind/button
        // TODO: add framework for async prompters
        // this needs to be done before adding steps to the state machine as to not increment steps
        this.form.runtimeAndPackage.bindPrompter(state => 
            createRuntimeQuickPick({
                // TODO: remove check when SAM CLI version is low enough
                showImageRuntimes: semver.gte(this.samCliVersion, MINIMUM_SAM_CLI_VERSION_INCLUSIVE_FOR_IMAGE_SUPPORT),
                //buttons: [this.helpButton],
            }
        ))
        
        this.form.dependencyManager.bindPrompter(state =>
            createManagerQuickPick(state.runtimeAndPackage.runtime),
            {
                showWhen: form => getDependencyManager(form.runtimeAndPackage.runtime).length > 1
                // defaultValue:
                // autoSelect: automatically select if only 1 option is available [boolean]
            }
        )
        
        this.form.template.bindPrompter(form => // check for credentials + starter template here
            createTemplateQuickPick(form.runtimeAndPackage.runtime, form.runtimeAndPackage.packageType, this.samCliVersion)
        )

        this.form.region.bindPrompter(form => 
            createRegionQuickPick(this.schemasRegions),
            {
                showWhen: form => form.template === eventBridgeStarterAppTemplate,
            }
        )

        this.form.registryName.bindPrompter(form => 
            createRegistryQuickPick(form.region!, this.currentCredentials),
            {
                showWhen: form => form.template === eventBridgeStarterAppTemplate,
            }
        )

        this.form.schemaName.bindPrompter(form => 
            createSchemaQuickPick(form.region!, form.registryName!, this.currentCredentials),
            {
                showWhen: form => form.template === eventBridgeStarterAppTemplate,
            }
        )
        
        this.form.location.bindPrompter(form => 
            createLocationPrompt(vscode.workspace.workspaceFolders ?? [])
        )

        this.form.name.bindPrompter(form => 
            createNameInputBox(fsutil.getNonexistentFilename(form.location!.fsPath, `lambda-${form.runtimeAndPackage.runtime}`, '', 99)),
            {
                validateInput: validateName,
            }
        )
    }

    public async run(): Promise<CreateNewSamAppWizardResponse | undefined> {
        const finalState = await super.runMachine()

        if (finalState === undefined) {
            return undefined
        }

        return {
            ...finalState,
            packageType: finalState.runtimeAndPackage.packageType,
            runtime: finalState.runtimeAndPackage.runtime,
        }
    }
}
