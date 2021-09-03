/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import * as AWS from '@aws-sdk/types'
import { Runtime } from 'aws-sdk/clients/lambda'
import * as path from 'path'
import * as vscode from 'vscode'
import { SchemasDataProvider } from '../../eventSchemas/providers/schemasDataProvider'
import { SchemaClient } from '../../shared/clients/schemaClient'
import { eventBridgeSchemasDocUrl, samInitDocUrl } from '../../shared/constants'
import { ext } from '../../shared/extensionGlobals'
import { Region } from '../../shared/regions/endpoints'
import { createBackButton, createExitButton, createHelpButton } from '../../shared/ui/buttons'
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
import { createLocationPrompt } from '../../shared/ui/common/location'
import { createInputBox, InputBoxPrompter } from '../../shared/ui/inputPrompter'
import { createLabelQuickPick, createQuickPick, QuickPickPrompter } from '../../shared/ui/pickerPrompter'
import { createRegionPrompter } from '../../shared/ui/common/region'

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

// TODO: split runtime and packageType into separate prompts, then use the above interface directly?
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

function makeButtons(helpUri?: string | vscode.Uri) {
    return [createHelpButton(helpUri), createBackButton(), createExitButton()]
}

function createRuntimePrompter(samCliVersion: string): QuickPickPrompter<RuntimePlusPackage> {
    return createRuntimeQuickPick({
        showImageRuntimes: semver.gte(samCliVersion, MINIMUM_SAM_CLI_VERSION_INCLUSIVE_FOR_IMAGE_SUPPORT),
        buttons: makeButtons(samInitDocUrl),
    }).transform(([runtime, packageType]) => ({ runtime, packageType })) as QuickPickPrompter<any>
}

function createTemplatePrompter(
    currRuntime: Runtime,
    packageType: RuntimePackageType,
    samCliVersion: string
): QuickPickPrompter<SamTemplate> {
    const templates = getSamTemplateWizardOption(currRuntime, packageType, samCliVersion)
    const items = templates.toArray().map(template => ({
        label: template,
        data: template,
        detail: getTemplateDescription(template),
    }))

    return createQuickPick(items, {
        title: localize('AWS.samcli.initWizard.template.prompt', 'Select a SAM Application Template'),
        buttons: makeButtons(samInitDocUrl),
    })
}

function createSchemaRegionPrompter(schemaRegions: Region[]): QuickPickPrompter<string> {
    return createRegionPrompter(schemaRegions, {
        title: localize('AWS.samcli.initWizard.schemas.region.prompt', 'Select an EventBridge Schemas Region'),
        buttons: makeButtons(eventBridgeSchemasDocUrl),
    }).transform(r => r.id)
}

function createDependencyPrompter(currRuntime: Runtime): QuickPickPrompter<DependencyManager> {
    const dependencyManagers = getDependencyManager(currRuntime)
    const items = dependencyManagers.map(dependencyManager => ({ label: dependencyManager }))

    return createLabelQuickPick(items, {
        title: localize('AWS.samcli.initWizard.dependencyManager.prompt', 'Select a Dependency Manager'),
        buttons: makeButtons(samInitDocUrl),
    })
}

function createRegistryPrompter(region: string, credentials?: AWS.Credentials): QuickPickPrompter<string> {
    const client: SchemaClient = ext.toolkitClientBuilder.createSchemaClient(region)
    const items = SchemasDataProvider.getInstance()
        .getRegistries(region, client, credentials!)
        .then(registryNames => {
            if (!registryNames) {
                vscode.window.showInformationMessage(
                    localize(
                        'AWS.samcli.initWizard.schemas.registry.failed_to_load_resources',
                        'Error loading registries.'
                    )
                )
                return []
            }

            return registryNames.map(registry => ({
                label: registry,
            }))
        })

    return createLabelQuickPick(items, {
        title: localize('AWS.samcli.initWizard.schemas.registry.prompt', 'Select a Registry'),
        buttons: makeButtons(samInitDocUrl),
    })
}

function createSchemaPrompter(
    region: string,
    registry: string,
    credentials?: AWS.Credentials
): QuickPickPrompter<string> {
    const client: SchemaClient = ext.toolkitClientBuilder.createSchemaClient(region)
    const items = SchemasDataProvider.getInstance()
        .getSchemas(region, registry, client, credentials!)
        .then(schemas => {
            if (!schemas) {
                vscode.window.showInformationMessage(
                    localize(
                        'AWS.samcli.initWizard.schemas.failed_to_load_resources',
                        'Error loading schemas in registry {0}.',
                        registry
                    )
                )
                return []
            }

            if (schemas!.length === 0) {
                vscode.window.showInformationMessage(
                    localize('AWS.samcli.initWizard.schemas.notFound"', 'No schemas found in registry {0}.', registry)
                )
                return []
            }

            return schemas!.map(schema => ({
                label: schema.SchemaName!,
            }))
        })

    return createLabelQuickPick(items, {
        title: localize('AWS.samcli.initWizard.schemas.schema.prompt', 'Select a Schema'),
        buttons: makeButtons(eventBridgeSchemasDocUrl),
    })
}

function createNamePrompter(defaultValue: string): InputBoxPrompter {
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
        buttons: makeButtons(samInitDocUrl),
        validateInput: validateName,
    })
}

export class CreateNewSamAppWizard extends Wizard<CreateNewSamAppWizardForm> {
    public constructor(
        context: { samCliVersion: string; schemasRegions: Region[]; credentials?: AWS.Credentials },
        initState?: CreateNewSamAppWizardForm
    ) {
        super()

        this.form.runtimeAndPackage.bindPrompter(() => createRuntimePrompter(context.samCliVersion))

        this.form.dependencyManager.bindPrompter(state => createDependencyPrompter(state.runtimeAndPackage.runtime!), {
            showWhen: state =>
                state.runtimeAndPackage?.runtime !== undefined &&
                getDependencyManager(state.runtimeAndPackage.runtime).length > 1,
            setDefault: state =>
                state.runtimeAndPackage?.runtime !== undefined
                    ? getDependencyManager(state.runtimeAndPackage.runtime)[0]
                    : undefined,
        })

        this.form.template.bindPrompter(state =>
            createTemplatePrompter(
                state.runtimeAndPackage.runtime!,
                state.runtimeAndPackage.packageType!,
                context.samCliVersion
            )
        )

        function isStarterTemplate(state: { template?: string }): boolean {
            return state.template === eventBridgeStarterAppTemplate
        }

        this.form.region.bindPrompter(() => createSchemaRegionPrompter(context.schemasRegions), {
            showWhen: isStarterTemplate,
        })

        this.form.registryName.bindPrompter(form => createRegistryPrompter(form.region!, context.credentials), {
            showWhen: isStarterTemplate,
        })

        this.form.schemaName.bindPrompter(
            state => createSchemaPrompter(state.region!, state.registryName!, context.credentials),
            {
                showWhen: isStarterTemplate,
            }
        )

        this.form.location.bindPrompter(() =>
            createLocationPrompt(vscode.workspace.workspaceFolders ?? [], { buttons: makeButtons(samInitDocUrl) })
        )

        this.form.name.bindPrompter(state =>
            createNamePrompter(
                fsutil.getNonexistentFilename(
                    state.location!.fsPath,
                    `lambda-${state.runtimeAndPackage.runtime}`,
                    '',
                    99
                )
            )
        )
    }
}
