/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import { Credentials } from 'aws-sdk'
import { Runtime } from 'aws-sdk/clients/lambda'
import * as path from 'path'
import * as vscode from 'vscode'
import { SchemasDataProvider } from '../../eventSchemas/providers/schemasDataProvider'
import { SchemaClient } from '../../shared/clients/schemaClient'
import { eventBridgeSchemasDocUrl, samInitDocUrl } from '../../shared/constants'
import { ext } from '../../shared/extensionGlobals'
import { Region } from '../../shared/regions/endpoints'
import { createBackButton, createHelpButton } from '../../shared/ui/buttons'
import {
    createRuntimeQuickPick,
    DependencyManager,
    getDependencyManager,
    RuntimePackageType,
} from '../models/samLambdaRuntime'
import {
    eventBridgeStarterAppTemplate,
    getSamTemplateWizardOption,
    getTemplateDescription,
    SamTemplate,
} from '../models/samTemplates'
import * as semver from 'semver'
import { MINIMUM_SAM_CLI_VERSION_INCLUSIVE_FOR_IMAGE_SUPPORT } from '../../shared/sam/cli/samCliValidator'
import * as fsutil from '../../shared/filesystemUtilities'
import { Wizard } from '../../shared/wizards/wizard'
import { createLocationPrompt } from '../../shared/ui/prompts'
import { initializeInterface } from '../../shared/transformers'
import { Prompter, PrompterButtons } from '../../shared/ui/prompter'
import { createInputBox, InputBoxPrompter } from '../../shared/ui/input'
import { createLabelQuickPick, createQuickPick } from '../../shared/ui/picker'
import { QuickPickPrompter } from '../../shared/ui/picker'

const localize = nls.loadMessageBundle()
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

// TODO: split runtime and packageType into separate prompts, then use the above interface directly
export interface CreateNewSamAppWizardForm {
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

export interface RuntimePlusPackage {
    packageType: RuntimePackageType
    runtime: Runtime
}

export interface CreateNewSamAppWizardContext {
    readonly samButtons: PrompterButtons
    readonly schemaButtons: PrompterButtons
    readonly currentCredentials: Credentials | undefined, 
    readonly schemasRegions: Region[], 
    readonly samCliVersion: string
    createTemplatePrompter(currRuntime: Runtime, packageType: RuntimePackageType): Prompter<SamTemplate>
    createRegionPrompter(): Prompter<string>
    createDependencyPrompter(currRuntime: Runtime): Prompter<DependencyManager>
    createRegistryPrompter(currRegion: string): Prompter<string>
    createSchemaPrompter(currRegion: string, currRegistry: string): Prompter<string>
    createNamePrompter(defaultValue: string): Prompter<string> 
    createRuntimePrompter(): Prompter<RuntimePlusPackage> 
    createLocationPrompter(): Prompter<vscode.Uri>
}


export class DefaultCreateNewSamAppWizardContext implements CreateNewSamAppWizardContext {
    private readonly samHelpButton = createHelpButton(samInitDocUrl)
    private readonly schemaHelpButton = createHelpButton(eventBridgeSchemasDocUrl)

    public readonly samButtons: PrompterButtons = [createBackButton(), this.samHelpButton]
    public readonly schemaButtons: PrompterButtons = [createBackButton(), this.schemaHelpButton]

    constructor(
        public readonly currentCredentials: Credentials | undefined, 
        public readonly schemasRegions: Region[], 
        public readonly samCliVersion: string
    ) {}

    public createRuntimePrompter(): QuickPickPrompter<RuntimePlusPackage> {
        return createRuntimeQuickPick({ 
            showImageRuntimes: semver.gte(this.samCliVersion, MINIMUM_SAM_CLI_VERSION_INCLUSIVE_FOR_IMAGE_SUPPORT),
            buttons: this.samButtons
        })
    }

    public createTemplatePrompter(
        currRuntime: Runtime,
        packageType: RuntimePackageType,
    ): QuickPickPrompter<SamTemplate> {
        const templates = getSamTemplateWizardOption(currRuntime, packageType, this.samCliVersion)
        const items = templates.toArray().map(template => ({
            label: template,
            data: template,
            detail: getTemplateDescription(template),
        }))
    
        return createQuickPick(items, { 
            title: localize('AWS.samcli.initWizard.template.prompt', 'Select a SAM Application Template'),
            buttons: this.samButtons,
        })
    }
    
    public createRegionPrompter(): QuickPickPrompter<string> {
        const items = this.schemasRegions.map(region => ({
            label: region.name,
            detail: region.id,
            data: region.id,
        }))
    
        return createQuickPick(items, { 
            title: localize('AWS.samcli.initWizard.schemas.region.prompt', 'Select an EventBridge Schemas Region'),
            buttons: this.samButtons,
        })
    }
    
    public createDependencyPrompter(currRuntime: Runtime): QuickPickPrompter<DependencyManager> {
        const dependencyManagers = getDependencyManager(currRuntime)
        const items = dependencyManagers.map(dependencyManager => ({ label: dependencyManager }))
    
        return createLabelQuickPick(items, {
            title: localize('AWS.samcli.initWizard.dependencyManager.prompt', 'Select a Dependency Manager'),
            buttons: this.samButtons,
        })
    }
    
    public createRegistryPrompter(currRegion: string): QuickPickPrompter<string> {
        const client: SchemaClient = ext.toolkitClientBuilder.createSchemaClient(currRegion)
        const items = SchemasDataProvider.getInstance().getRegistries(
            currRegion,
            client,
            this.currentCredentials!
        ).then(registryNames => {
            if (!registryNames) {
                vscode.window.showInformationMessage(
                    localize('AWS.samcli.initWizard.schemas.registry.failed_to_load_resources', 'Error loading registries.')
                )
                return undefined
            }
    
            return registryNames.map(registry => ({
                label: registry,
            }))
        })
    
        return createLabelQuickPick(items, { 
            title: localize('AWS.samcli.initWizard.schemas.registry.prompt', 'Select a Registry'),
            buttons: this.schemaButtons,
        })
    }
    
    public createSchemaPrompter(
        currRegion: string,
        currRegistry: string,
    ): QuickPickPrompter<string> {
        const client: SchemaClient = ext.toolkitClientBuilder.createSchemaClient(currRegion)
        const items = SchemasDataProvider.getInstance()
            .getSchemas(currRegion, currRegistry, client, this.currentCredentials!)
            .then(schemas => {
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
    
                return schemas!.map(schema => ({
                    label: schema.SchemaName!,
                }))
            })
    
        return createLabelQuickPick(items, { 
            title: localize('AWS.samcli.initWizard.schemas.schema.prompt', 'Select a Schema'),
            buttons: this.schemaButtons,
        })
    }
    
    public createNamePrompter(defaultValue: string): InputBoxPrompter {
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

        return createInputBox({
            value: defaultValue,
            title: localize('AWS.samcli.initWizard.name.prompt', 'Enter a name for your new application'),
            buttons: this.samButtons,
            validateInput: validateName,
        })
    }

    public createLocationPrompter(): Prompter<vscode.Uri> {
        return createLocationPrompt(vscode.workspace.workspaceFolders ?? [], this.samButtons)
    }
}

export class CreateNewSamAppWizard extends Wizard<CreateNewSamAppWizardForm, CreateNewSamAppWizardResponse> {
    public constructor(context: CreateNewSamAppWizardContext, initState?: CreateNewSamAppWizardForm) {
        super(initializeInterface<CreateNewSamAppWizardForm>(), initState)
        
        this.form.runtimeAndPackage.bindPrompter(form => context.createRuntimePrompter())
        
        this.form.dependencyManager.bindPrompter(
            form => context.createDependencyPrompter(form.runtimeAndPackage.runtime!),
            {
                showWhen: form => form.runtimeAndPackage.runtime !== undefined && getDependencyManager(form.runtimeAndPackage.runtime).length > 1,
                setDefault: form => form.runtimeAndPackage.runtime !== undefined ? getDependencyManager(form.runtimeAndPackage.runtime)[0] : undefined
            }
        )
        
        this.form.template.bindPrompter(form =>
            context.createTemplatePrompter(form.runtimeAndPackage.runtime!, form.runtimeAndPackage.packageType!)
        )

        this.form.region.bindPrompter(form => 
            context.createRegionPrompter(),
            {
                showWhen: form => form.template === eventBridgeStarterAppTemplate,
            }
        )

        this.form.registryName.bindPrompter(form => 
            context.createRegistryPrompter(form.region!),
            {
                showWhen: form => form.template === eventBridgeStarterAppTemplate,
            }
        )

        this.form.schemaName.bindPrompter(form => 
            context.createSchemaPrompter(form.region!, form.registryName!),
            {
                showWhen: form => form.template === eventBridgeStarterAppTemplate,
            }
        )
        
        this.form.location.bindPrompter(form => context.createLocationPrompter())

        this.form.name.bindPrompter(form => 
            context.createNamePrompter(fsutil.getNonexistentFilename(form.location!.fsPath, `lambda-${form.runtimeAndPackage.runtime}`, '', 99))
        )
    }

    public async run(): Promise<CreateNewSamAppWizardResponse | undefined> {
        const finalState = await super.run() as CreateNewSamAppWizardForm

        if (finalState === undefined) {
            return undefined
        }

        return {
            ...finalState,
            ...finalState.runtimeAndPackage,
        }
    }
}
