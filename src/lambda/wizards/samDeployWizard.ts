/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import * as _ from 'lodash'

const localize = nls.loadMessageBundle()

import * as path from 'path'
import * as vscode from 'vscode'
import { samDeployDocUrl } from '../../shared/constants'
import * as localizedText from '../../shared/localizedText'
import { getLogger } from '../../shared/logger'
import { createCommonButtons } from '../../shared/ui/buttons'
import { difference, filter } from '../../shared/utilities/collectionUtils'
import { ext } from '../../shared/extensionGlobals'
import { getSamCliVersion, SamCliContext } from '../../shared/sam/cli/samCliContext'
import * as semver from 'semver'
import { MINIMUM_SAM_CLI_VERSION_INCLUSIVE_FOR_IMAGE_SUPPORT } from '../../shared/sam/cli/samCliValidator'
import { isCloud9 } from '../../shared/extensionUtilities'
import { CloudFormation } from '../../shared/cloudformation/cloudformation'
import { Wizard, WIZARD_BACK, WIZARD_FORCE_EXIT } from '../../shared/wizards/wizard'
import { configureParameterOverrides } from '../config/configureParameterOverrides'
import { createInputBox, InputBoxPrompter } from '../../shared/ui/inputPrompter'
import { createQuickPick, DataQuickPickItem, QuickPickPrompter } from '../../shared/ui/pickerPrompter'
import { createS3BucketPrompter } from '../../shared/ui/common/s3Bucket'
import { createRegionPrompter } from '../../shared/ui/common/region'
import { AwsContext } from '../../shared/awsContext'
import { RegionProvider } from '../../shared/regions/regionProvider'
import { createEcrPrompter } from '../../shared/ui/common/ecrRepository'
import { PromptResult } from '../../shared/ui/prompter'
import { getOverriddenParameters, getParameters } from '../config/parameterUtils'
import { BasicExitPrompter } from '../../shared/ui/common/basicExit'

export const CHOSEN_BUCKET_KEY = 'manuallySelectedBuckets'

export interface SavedBuckets {
    [profile: string]: { [region: string]: string }
}

type CFNTemplate = CloudFormation.Template & {
    uri: vscode.Uri
    parameterOverrides?: Map<string, string>
    missingParameters?: Set<string>
}
export const CONFIGURE_PARAMETERS = new Map<string, string>()

export interface SamDeployWizardResponse {
    missingParameters?: Set<string>
    parameterOverrides: Map<string, string>
    region: string
    template: CFNTemplate
    s3Bucket: string
    ecrRepo?: string
    stackName: string
}

/**
 * Retrieves the URI of a Sam template to deploy from the user
 *
 * @returns vscode.Uri of a Sam Template. undefined represents cancel.
 */
export function createSamTemplatePrompter(samContext: SamCliContext): QuickPickPrompter<CFNTemplate> {
    return createQuickPick(getTemplateChoices(samContext), {
        title: localize('AWS.samcli.deploy.template.prompt', 'Which SAM Template would you like to deploy to AWS?'),
        buttons: createCommonButtons(samDeployDocUrl),
    })
}

/**
 * Prompts the user to configure parameter overrides, then either pre-fills and opens
 * `templates.json`, or returns true.
 *
 * @param options.templateUri The URL of the SAM template to inspect.
 * @param options.missingParameters The names of required parameters that are not yet overridden.
 * @returns A value indicating whether the wizard should proceed. `false` if `missingParameters` was
 *          non-empty, or if it was empty and the user opted to configure overrides instead of continuing.
 */

export function createParametersPrompter(
    templateUri: vscode.Uri,
    missingParameters: Set<string> = new Set<string>()
): QuickPickPrompter<Map<string, string>> {
    const configure = async () => {
        configureParameterOverrides({
            templateUri,
            requiredParameterNames: missingParameters?.keys(),
        })
        return WIZARD_FORCE_EXIT
    }

    if (missingParameters.size < 1) {
        const title = localize(
            'AWS.samcli.deploy.parameters.optionalPrompt.message',
            // prettier-ignore
            'The template {0} contains parameters. Would you like to override the default values for these parameters?',
            templateUri.fsPath
        )

        const items: DataQuickPickItem<Map<string, string>>[] = [
            { label: localizedText.yes, data: configure },
            { label: localizedText.no, data: new Map<string, string>() },
        ]

        return createQuickPick(items, { title, buttons: createCommonButtons(samDeployDocUrl) })
    } else {
        const title = localize(
            'AWS.samcli.deploy.parameters.mandatoryPrompt.message',
            // prettier-ignore
            'The template {0} contains parameters without default values. In order to deploy, you must provide values for these parameters. Configure them now?',
            templateUri.fsPath
        )
        const responseConfigure = localize(
            'AWS.samcli.deploy.parameters.mandatoryPrompt.responseConfigure',
            'Configure'
        )
        const responseCancel = localizedText.cancel

        const items: DataQuickPickItem<Map<string, string>>[] = [
            { label: responseConfigure, data: configure },
            { label: responseCancel, data: WIZARD_FORCE_EXIT },
        ]

        return createQuickPick(items, { title, buttons: createCommonButtons(samDeployDocUrl) })
    }
}

/**
 * Retrieves a Stack Name to deploy to from the user.
 *
 * @param initialValue Optional, Initial value to prompt with
 * @param validateInput Optional, validates input as it is entered
 *
 * @returns Stack name. Undefined represents cancel.
 */

function createStackNamePrompter(): InputBoxPrompter {
    return createInputBox({
        title: localize('AWS.samcli.deploy.stackName.prompt', 'Enter the name to use for the deployed stack'),
        validateInput: validateStackName,
        buttons: createCommonButtons(samDeployDocUrl),
    })
}

export class SamDeployWizard extends Wizard<SamDeployWizardResponse> {
    public constructor(
        context: { awsContext: AwsContext; regionProvider: RegionProvider; samCliContext: () => SamCliContext },
        commandArgs?: string | CFNTemplate
    ) {
        super({
            initState: {
                region: typeof commandArgs === 'string' ? commandArgs : undefined,
                template: typeof commandArgs === 'object' ? commandArgs : undefined,
            },
            exitPrompter: BasicExitPrompter,
        })
        const profile = context.awsContext.getCredentialProfileName()
        const accountId = context.awsContext.getCredentialAccountId()

        const form = this.form

        form.template.bindPrompter(() => createSamTemplatePrompter(context.samCliContext()))

        this.form.parameterOverrides.bindPrompter(
            ({ template }) => createParametersPrompter(template.uri, template.missingParameters),
            {
                showWhen: state => !state.template.parameterOverrides,
                setDefault: () => new Map(),
                dependencies: [this.form.template],
            }
        )

        this.form.region.bindPrompter(() =>
            createRegionPrompter({
                title: localize('AWS.samcli.deploy.region.prompt', 'Which AWS Region would you like to deploy to?'),
                defaultRegion: context.awsContext.getCredentialDefaultRegion(),
                helpUri: samDeployDocUrl,
            }).transform(r => r.id)
        )

        form.s3Bucket.bindPrompter(
            state =>
                createS3BucketPrompter({
                    profile,
                    region: state.region,
                    baseBuckets: isCloud9() ? [`cloud9-${accountId}-sam-deployments-${state.region}`] : [],
                    title: localize('AWS.samcli.deploy.s3Bucket.title', 'Select an AWS S3 Bucket to deploy code to'),
                }).transform(({ name }) => name),
            { dependencies: [this.form.region] }
        )

        const ecrPromptOptions = {
            title: localize('AWS.samcli.deploy.ecrRepo.prompt', 'Select an ECR repo to deploy images to'),
            noPublicMessage: localize('AWS.samcli.deploy.ecrRepo.nopublic', 'Cannot deploy to public ECR'),
            skipTag: true,
        }

        this.form.ecrRepo.bindPrompter(
            ({ region }) =>
                createEcrPrompter(region, ecrPromptOptions).transform(
                    resp => `${resp.repo.repositoryUri}${resp.repo.tag === 'latest' ? '' : `:${resp.repo.tag}`}`
                ),
            {
                showWhen: state => isImage(state.template),
                dependencies: [this.form.template, this.form.region],
            }
        )

        this.form.stackName.bindPrompter(createStackNamePrompter)
    }
}

function isImage(template: CloudFormation.Template): boolean {
    const resources = template.Resources

    return (
        resources !== undefined &&
        Object.keys(resources)
            .filter(key => resources[key]?.Type === 'AWS::Serverless::Function')
            .map(key => resources[key]?.Properties?.PackageType)
            .some(it => it === 'Image')
    )
}

// If workspace is /usr/foo/code and uri is /usr/foo/code/processor/template.yaml return processor/template.yaml
function resolveRelative(uri: vscode.Uri) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)

    if (workspaceFolder) {
        return path.relative(workspaceFolder.uri.fsPath, uri.fsPath)
    }

    getLogger().warn(`"${uri.fsPath}" not found within a workspace folder`)
}

function localeSortItem(a: vscode.QuickPickItem, b: vscode.QuickPickItem): number {
    return (
        a.label.localeCompare(b.label) ||
        (a.description ?? '').localeCompare(b.description ?? '') ||
        (a.detail ?? '').localeCompare(b.detail ?? '')
    )
}

async function parseTemplate(template: CFNTemplate, context: SamCliContext): Promise<PromptResult<CFNTemplate>> {
    if (isImage(template)) {
        // TODO: remove check when min version is high enough
        const samCliVersion = await getSamCliVersion(context)
        if (semver.lt(samCliVersion, MINIMUM_SAM_CLI_VERSION_INCLUSIVE_FOR_IMAGE_SUPPORT)) {
            vscode.window.showErrorMessage(
                localize(
                    'AWS.output.sam.no.image.support',
                    'Support for Image-based Lambdas requires a minimum SAM CLI version of 1.13.0.'
                )
            )
            return WIZARD_BACK
        }
    }

    return computeTemplateParameters(template)
}

export async function computeTemplateParameters(template: CFNTemplate): Promise<CFNTemplate> {
    const parameters = await getParameters(template.uri)
    if (parameters === undefined || parameters.size < 1) {
        return { ...template, parameterOverrides: new Map() }
    }

    const requiredParameterNames = new Set<string>(filter(parameters.keys(), name => parameters.get(name)!.required))
    const overriddenParameters = await getOverriddenParameters(template.uri)
    if (overriddenParameters === undefined) {
        return {
            ...template,
            missingParameters: requiredParameterNames.size > 0 ? requiredParameterNames : undefined,
        }
    } else {
        const missingParameters = difference(requiredParameterNames, overriddenParameters.keys())

        if (missingParameters.size === 0) {
            return { ...template, parameterOverrides: overriddenParameters }
        }

        return { ...template, missingParameters }
    }
}

// https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_CreateStack.html
// A stack name can contain only alphanumeric characters (case sensitive) and hyphens.
// It must start with an alphabetic character and cannot be longer than 128 characters.
export function validateStackName(value: string): string | undefined {
    if (!/^[a-zA-Z\d\-]+$/.test(value)) {
        return localize(
            'AWS.samcli.deploy.stackName.error.invalidCharacters',
            'A stack name may contain only alphanumeric characters (case sensitive) and hyphens'
        )
    }

    if (!/^[a-zA-Z]/.test(value)) {
        return localize(
            'AWS.samcli.deploy.stackName.error.firstCharacter',
            'A stack name must begin with an alphabetic character'
        )
    }

    if (value.length > 128) {
        return localize(
            'AWS.samcli.deploy.stackName.error.length',
            'A stack name must not be longer than 128 characters'
        )
    }

    // TODO: Validate that a stack with this name does not already exist.

    return undefined
}

function getTemplateChoices(samContext: SamCliContext) {
    const templates = ext.templateRegistry.registeredItems
    const labels = new Set<string>()

    const templateItems = templates
        .map(template => {
            const uri = vscode.Uri.file(template.path)
            const label = resolveRelative(uri) ?? uri.fsPath
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
            const description = labels.has(label) && workspaceFolder ? `in ${workspaceFolder.uri.fsPath}` : ''

            labels.add(label)

            return {
                label,
                description,
                data: () => parseTemplate({ ...template.item, uri }, samContext),
            }
        })
        .sort(localeSortItem)

    return templateItems
}
