/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import * as AWS from '@aws-sdk/types'
import { Runtime } from 'aws-sdk/clients/lambda'
import * as path from 'path'
import * as vscode from 'vscode'
import { SchemasDataProvider } from '../../eventSchemas/providers/schemasDataProvider'
import { DefaultSchemaClient } from '../../shared/clients/schemaClient'
import { eventBridgeSchemasDocUrl, samInitDocUrl } from '../../shared/constants'
import {
    Architecture,
    createRuntimeQuickPick,
    DependencyManager,
    getDependencyManager,
    RuntimeAndPackage,
    RuntimePackageType,
    samArmLambdaRuntimes,
} from '../models/samLambdaRuntime'
import {
    eventBridgeStarterAppTemplate,
    getSamTemplateWizardOption,
    getTemplateDescription,
    SamTemplate,
} from '../models/samTemplates'
import * as semver from 'semver'
import { minSamCliVersionForArmSupport, minSamCliVersionForImageSupport } from '../../shared/sam/cli/samCliValidator'
import { Wizard } from '../../shared/wizards/wizard'
import { createFolderPrompt } from '../../shared/ui/common/location'
import { createInputBox, InputBoxPrompter } from '../../shared/ui/inputPrompter'
import { createLabelQuickPick, createQuickPick, QuickPickPrompter } from '../../shared/ui/pickerPrompter'
import { createRegionPrompter } from '../../shared/ui/common/region'
import { Region } from '../../shared/regions/endpoints'
import { createCommonButtons } from '../../shared/ui/buttons'
import { createExitPrompter } from '../../shared/ui/common/exitPrompter'
import { getNonexistentFilename } from '../../shared/filesystemUtilities'

const localize = nls.loadMessageBundle()

export interface CreateNewSamAppWizardForm {
    runtimeAndPackage: RuntimeAndPackage
    dependencyManager: DependencyManager
    architecture?: Architecture
    template: SamTemplate
    region?: string
    registryName?: string
    schemaName?: string
    location: vscode.Uri
    name: string
}

function createRuntimePrompter(samCliVersion: string): QuickPickPrompter<RuntimeAndPackage> {
    return createRuntimeQuickPick({
        showImageRuntimes: semver.gte(samCliVersion, minSamCliVersionForImageSupport),
        buttons: createCommonButtons(samInitDocUrl),
    })
}

function createSamTemplatePrompter(
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
        buttons: createCommonButtons(samInitDocUrl),
    })
}

function createSchemaRegionPrompter(regions: Region[], defaultRegion?: string): QuickPickPrompter<string> {
    return createRegionPrompter(regions, {
        title: localize('AWS.samcli.initWizard.schemas.region.prompt', 'Select an EventBridge Schemas Region'),
        buttons: createCommonButtons(eventBridgeSchemasDocUrl),
        defaultRegion,
    }).transform(r => r.id)
}

function createDependencyPrompter(currRuntime: Runtime): QuickPickPrompter<DependencyManager> {
    const dependencyManagers = getDependencyManager(currRuntime)
    const items = dependencyManagers.map(dependencyManager => ({ label: dependencyManager }))

    return createLabelQuickPick(items, {
        title: localize('AWS.samcli.initWizard.dependencyManager.prompt', 'Select a Dependency Manager'),
        buttons: createCommonButtons(samInitDocUrl),
    })
}

function createRegistryPrompter(region: string, credentials?: AWS.Credentials): QuickPickPrompter<string> {
    const client = new DefaultSchemaClient(region)
    const items = SchemasDataProvider.getInstance()
        .getRegistries(region, client, credentials!)
        .then(registryNames => {
            if (!registryNames) {
                void vscode.window.showInformationMessage(
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
        buttons: createCommonButtons(samInitDocUrl),
    })
}

function createSchemaPrompter(
    region: string,
    registry: string,
    credentials?: AWS.Credentials
): QuickPickPrompter<string> {
    const client = new DefaultSchemaClient(region)
    const items = SchemasDataProvider.getInstance()
        .getSchemas(region, registry, client, credentials!)
        .then(schemas => {
            if (!schemas) {
                void vscode.window.showInformationMessage(
                    localize(
                        'AWS.samcli.initWizard.schemas.failed_to_load_resources',
                        'Error loading schemas in registry {0}.',
                        registry
                    )
                )
                return []
            }

            if (schemas.length === 0) {
                void vscode.window.showInformationMessage(
                    localize('AWS.samcli.initWizard.schemas.notFound"', 'No schemas found in registry {0}.', registry)
                )
                return []
            }

            return schemas.map(schema => ({
                label: schema.SchemaName!,
            }))
        })

    return createLabelQuickPick(items, {
        title: localize('AWS.samcli.initWizard.schemas.schema.prompt', 'Select a Schema'),
        buttons: createCommonButtons(eventBridgeSchemasDocUrl),
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
        buttons: createCommonButtons(samInitDocUrl),
        validateInput: validateName,
    })
}

function createArchitecturePrompter(): QuickPickPrompter<Architecture> {
    return createLabelQuickPick<Architecture>([{ label: 'x86_64' }, { label: 'arm64' }], {
        title: localize('AWS.samcli.initWizard.architecture.prompt', 'Select an Architecture'),
        buttons: createCommonButtons(samInitDocUrl),
    })
}

export class CreateNewSamAppWizard extends Wizard<CreateNewSamAppWizardForm> {
    public constructor(context: {
        samCliVersion: string
        schemaRegions: Region[]
        defaultRegion?: string
        credentials?: AWS.Credentials
    }) {
        super({
            exitPrompterProvider: createExitPrompter,
        })

        this.form.runtimeAndPackage.bindPrompter(() => createRuntimePrompter(context.samCliVersion))

        this.form.dependencyManager.bindPrompter(state => createDependencyPrompter(state.runtimeAndPackage!.runtime!), {
            showWhen: state =>
                state.runtimeAndPackage?.runtime !== undefined &&
                getDependencyManager(state.runtimeAndPackage.runtime).length > 1,
            setDefault: state =>
                state.runtimeAndPackage?.runtime !== undefined
                    ? getDependencyManager(state.runtimeAndPackage.runtime)[0]
                    : undefined,
        })

        // TODO: remove `partial` when updated wizard types gets merged (need to make the PR first of course...)
        function canShowArchitecture(
            state: Partial<Pick<CreateNewSamAppWizardForm, 'runtimeAndPackage' | 'dependencyManager'>>
        ): boolean {
            // TODO: Remove Image Maven check if/when Hello World app supports multiarch Maven builds
            if (state.dependencyManager === 'maven' && state.runtimeAndPackage?.packageType === 'Image') {
                return false
            }

            if (semver.lt(context.samCliVersion, minSamCliVersionForArmSupport)) {
                return false
            }

            return samArmLambdaRuntimes.has(state.runtimeAndPackage?.runtime ?? 'unknown')
        }

        this.form.architecture.bindPrompter(createArchitecturePrompter, {
            showWhen: canShowArchitecture,
        })

        this.form.template.bindPrompter(state =>
            createSamTemplatePrompter(
                state.runtimeAndPackage!.runtime!,
                state.runtimeAndPackage!.packageType!,
                context.samCliVersion
            )
        )

        function isStarterTemplate(state: { template?: string }): boolean {
            return state.template === eventBridgeStarterAppTemplate
        }

        this.form.region.bindPrompter(() => createSchemaRegionPrompter(context.schemaRegions, context.defaultRegion), {
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
            createFolderPrompt(vscode.workspace.workspaceFolders ?? [], {
                buttons: createCommonButtons(samInitDocUrl),
                title: localize('AWS.samInit.location.title', 'Select the folder for your new SAM application'),
                browseFolderDetail: localize(
                    'AWS.samInit.location.detail',
                    'The selected folder will be added to the workspace.'
                ),
            })
        )

        this.form.name.bindPrompter(async state => {
            const fname = await getNonexistentFilename(
                state.location!.fsPath,
                `lambda-${state.runtimeAndPackage!.runtime}`,
                '',
                99
            )
            return createNamePrompter(fname)
        })
    }
}
