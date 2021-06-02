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
import { getRegionsForActiveCredentials } from '../../shared/regions/regionUtilities'
import { createHelpButton } from '../../shared/ui/buttons'
import * as picker from '../../shared/ui/picker'
import * as telemetry from '../../shared/telemetry/telemetry'
import { difference, filter, IteratorTransformer } from '../../shared/utilities/collectionUtils'
import { getOverriddenParameters, getParameters } from '../utilities/parameterUtils'
import { ext } from '../../shared/extensionGlobals'
import { EcrRepository } from '../../shared/clients/ecrClient'
import { getSamCliVersion } from '../../shared/sam/cli/samCliContext'
import * as semver from 'semver'
import { MINIMUM_SAM_CLI_VERSION_INCLUSIVE_FOR_IMAGE_SUPPORT } from '../../shared/sam/cli/samCliValidator'
import { ExtContext } from '../../shared/extensions'
import { validateBucketName } from '../../s3/util'
import { showErrorWithLogs } from '../../shared/utilities/messages'
import { isCloud9 } from '../../shared/extensionUtilities'
import { SettingsConfiguration } from '../../shared/settingsConfiguration'
import { ButtonBinds, createPrompter, DataQuickPick, DataQuickPickItem, Prompter } from '../../shared/ui/prompter'
import { CloudFormation } from '../../shared/cloudformation/cloudformation'
import { Wizard, WIZARD_GOBACK } from '../../shared/wizards/wizard'
import { initializeInterface } from '../../shared/transformers'

const CREATE_NEW_BUCKET = localize('AWS.command.s3.createBucket', 'Create Bucket...')
const ENTER_BUCKET = localize('AWS.samcli.deploy.bucket.existingLabel', 'Enter Existing Bucket Name...')
export const CHOSEN_BUCKET_KEY = 'manuallySelectedBuckets'

export interface SavedBuckets {
    [profile: string]: { [region: string]: string }
}

export interface SamDeployWizardResponse {
    parameterOverrides: Map<string, string>
    region: string
    template: CloudFormation.Template,
    s3Bucket: string
    ecrRepo?: EcrRepository
    stackName: string
}

export const enum ParameterPromptResult {
    Cancel,
    Continue,
}

export interface SamDeployWizardContext {
    readonly extContext: ExtContext
    readonly workspaceFolders: vscode.Uri[] | undefined

    /**
     * Returns the parameters in the specified template, or `undefined`
     * if the template does not include a `Parameters` section. `required`
     * is set to `true` if the parameter does not have a default value.
     *
     * @param templateUri The URL of the SAM template to inspect.
     */
    getParameters: typeof getParameters

    /**
     * Returns the names and values of parameters from the specified template
     * that have been overridden in `templates.json`, or `undefined` if `templates.json`
     * does not include a `parameterOverrides` section for the specified template.
     *
     * @param templateUri
     */
    getOverriddenParameters: typeof getOverriddenParameters

    /**
     * Retrieves the URI of a Sam template to deploy from the user
     *
     * @returns vscode.Uri of a Sam Template. undefined represents cancel.
     */
    createSamTemplatePrompter(): Prompter<CloudFormation.Template> 
    /**
     * Prompts the user to configure parameter overrides, then either pre-fills and opens
     * `templates.json`, or returns true.
     *
     * @param options.templateUri The URL of the SAM template to inspect.
     * @param options.missingParameters The names of required parameters that are not yet overridden.
     * @returns A value indicating whether the wizard should proceed. `false` if `missingParameters` was
     *          non-empty, or if it was empty and the user opted to configure overrides instead of continuing.
     */

    createParametersPrompter(templateUri: vscode.Uri, missingParameters?: Set<string>): Prompter<ParameterPromptResult>

    createRegionPrompter(): Prompter<string>

    /**
     * Retrieves an S3 Bucket to deploy to from the user.
     *
     * @param initialValue Optional, Initial value to prompt with
     *
     * @returns S3 Bucket name. Undefined represents cancel.
     */

    createS3BucketPrompter(region: string, profile?: string, accountId?: string): Prompter<string>

    /**
     * Prompts user to enter a bucket name
     *
     * @returns S3 Bucket name. Undefined represents cancel.
     */

    /**
     * Retrieves an ECR Repo to deploy to from the user.
     *
     * @param initialValue Optional, Initial value to prompt with
     *
     * @returns ECR Repo URI. Undefined represents cancel.
     */

    /**
     * Retrieves a Stack Name to deploy to from the user.
     *
     * @param initialValue Optional, Initial value to prompt with
     * @param validateInput Optional, validates input as it is entered
     *
     * @returns Stack name. Undefined represents cancel.
     */
}
/**
 * The toolkit used to store saved buckets as a stringified JSON object. To ensure compatability,
 * we need to check for this and convert them into objects.
 */
export function readSavedBuckets(settings: SettingsConfiguration): SavedBuckets | undefined {
    try {
        const buckets = settings.readSetting<SavedBuckets | string | undefined>(CHOSEN_BUCKET_KEY)
        return typeof buckets === 'string' ? JSON.parse(buckets) : buckets
    } catch (e) {
        // If we fail to read settings then remove the bad data completely
        getLogger().error('Recent bucket JSON not parseable. Rewriting recent buckets from scratch...', e)
        settings.writeSetting(CHOSEN_BUCKET_KEY, {}, vscode.ConfigurationTarget.Global)
        return undefined
    }
}

/**
 * Writes a single new saved bucket to the stored buckets setting, combining previous saved data
 * if it exists. One saved bucket is limited per region per profile.
 */
export function writeSavedBucket(
    settings: SettingsConfiguration,
    profile: string,
    region: string,
    bucket: string
): void {
    const oldBuckets = readSavedBuckets(settings)

    settings.writeSetting(
        CHOSEN_BUCKET_KEY,
        {
            ...oldBuckets,
            [profile]: {
                ...(oldBuckets && oldBuckets[profile] ? oldBuckets[profile] : {}),
                [region]: bucket,
            },
        } as SavedBuckets,
        vscode.ConfigurationTarget.Global
    )
}

export class DefaultSamDeployWizardContext implements SamDeployWizardContext {
    public readonly getParameters = getParameters
    public readonly getOverriddenParameters = getOverriddenParameters
    private readonly helpButton = createHelpButton(localize('AWS.command.help', 'View Toolkit Documentation'))
    private readonly buttonBinds: ButtonBinds = new Map([
        [vscode.QuickInputButtons.Back, resolve => resolve(undefined)],
        [this.helpButton, () => vscode.env.openExternal(vscode.Uri.parse(samDeployDocUrl))]
    ])
    public newBucketCalled = false

    public constructor(readonly extContext: ExtContext) {}

    public createSamTemplatePrompter(): Prompter<CloudFormation.Template> {
        return createPrompter(getTemplateChoices(...(this.workspaceFolders || [])), {
            title: localize(
                'AWS.samcli.deploy.template.prompt',
                'Which SAM Template would you like to deploy to AWS?'
            ),
        })
    }
    public createParametersPrompter(
        templateUri: vscode.Uri, 
        missingParameters: Set<string> = new Set<string>()
    ): Prompter<ParameterPromptResult> {
        if (missingParameters.size < 1) {
            const title = localize(
                'AWS.samcli.deploy.parameters.optionalPrompt.message',
                // prettier-ignore
                'The template {0} contains parameters. Would you like to override the default values for these parameters?',
                templateUri.fsPath
            )

            const items: DataQuickPickItem<ParameterPromptResult>[] = [
                { label: localizedText.yes, data: ParameterPromptResult.Cancel }, // always cancel if override
                { label: localizedText.no, data: ParameterPromptResult.Continue }
            ]

            /*
            await configureParameterOverrides({
                templateUri,
                requiredParameterNames: missingParameters.keys(),
            })
            */

            return createPrompter(items, { title })
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

            const items: DataQuickPickItem<ParameterPromptResult>[] = [
                { label: responseConfigure, data: ParameterPromptResult.Cancel }, // fix this
                { label: responseCancel, data: ParameterPromptResult.Continue }
            ]

            /*
            if (response === responseConfigure) {
                await configureParameterOverrides({
                    templateUri,
                    requiredParameterNames: missingParameters.keys(),
                })
            }
            */

            return createPrompter(items, { title })
        }
    }
    public createRegionPrompter(): Prompter<string> {
        const partitionRegions = getRegionsForActiveCredentials(
            this.extContext.awsContext,
            this.extContext.regionProvider
        )

        const items: DataQuickPickItem<string>[] = partitionRegions.map(region => ({
            label: region.name,
            detail: region.id,
            data: region.id,
        }))

        return createPrompter(items, {
            title: localize('AWS.samcli.deploy.region.prompt', 'Which AWS Region would you like to deploy to?'),
            matchOnDetail: true,
        })
    }

    public createS3BucketPrompter(region: string, profile?: string, accountId?: string): Prompter<string> {
        const messages = {
            noBuckets: localize('AWS.samcli.deploy.s3bucket.picker.noBuckets', 'No buckets found.'),
            bucketError: localize('AWS.samcli.deploy.s3bucket.picker.error', 'There was an error loading S3 buckets.'),
        }
        const createBucket = {
            iconPath: {
                light: vscode.Uri.file(ext.iconPaths.light.plus),
                dark: vscode.Uri.file(ext.iconPaths.dark.plus),
            },
            tooltip: CREATE_NEW_BUCKET,
        }
        const enterBucket = {
            iconPath: {
                light: vscode.Uri.file(ext.iconPaths.light.edit),
                dark: vscode.Uri.file(ext.iconPaths.dark.edit),
            },
            tooltip: ENTER_BUCKET,
        }

        const bucketButtons = new Map(this.buttonBinds)
        bucketButtons.set(createBucket, resolve => resolve(NEW_BUCKET_OPTION))
        bucketButtons.set(enterBucket, resolve => resolve(ENTER_BUCKET_OPTION))
        const prompter = createPrompter<string>([], {
            title: localize('AWS.samcli.deploy.s3Bucket.prompt', 'Select an AWS S3 Bucket to deploy code to'),
            matchOnDetail: true,
            buttonBinds: bucketButtons,
        })
        const quickPick = prompter.quickInput as any

        quickPick.busy = true

        // NOTE: Do not await this promise.
        // This will background load the S3 buckets and load them all (in one chunk) when the operation completes.
        // Not awaiting lets us display a "loading" quick pick for immediate feedback.
        // Does not use an IteratingQuickPick because listing S3 buckets by region is not a paginated operation.
        populateS3QuickPick(quickPick, region, this.extContext.settings, messages, profile, accountId)
    
        return prompter
    }

    public get workspaceFolders(): vscode.Uri[] | undefined {
        return (vscode.workspace.workspaceFolders || []).map(f => f.uri)
    }

    public createS3BucketNamePrompter(title: string): Prompter<string> {
        return createPrompter({ title, buttonBinds: this.buttonBinds, validateInput: validateBucketName })
    }

    public createEcrRepoPrompter(region: string): Prompter<EcrRepository> {
        const prompter = createPrompter<EcrRepository>([], {
            title: localize('AWS.samcli.deploy.ecrRepo.prompt', 'Select a ECR repo to deploy images to'),
            matchOnDetail: true,
        })
        const populator = new IteratorTransformer<EcrRepository, DataQuickPickItem<EcrRepository>>(
            () => ext.toolkitClientBuilder.createEcrClient(region).describeRepositories(),
            response => (response === undefined ? [] : [{ label: response.repositoryName, data: response }])
        )
        const controller = new picker.IteratingQuickPickController(
            prompter.quickInput as vscode.QuickPick<DataQuickPickItem<EcrRepository>>, populator)
        controller.startRequests()
        return prompter
    }

    /**
     * Retrieves a Stack Name to deploy to from the user.
     *
     * @param initialValue Optional, Initial value to prompt with
     * @param validateInput Optional, validates input as it is entered
     *
     * @returns Stack name. Undefined represents cancel.
     */

    public createStackNamePrompter(): Prompter<string> {
        return createPrompter({
            title: localize('AWS.samcli.deploy.stackName.prompt', 'Enter the name to use for the deployed stack'),
            validateInput: validateStackName,
            buttonBinds: this.buttonBinds,
        })
    }
}

export class SamDeployWizard extends Wizard<SamDeployWizardResponse> {    
    public constructor(private readonly context: SamDeployWizardContext, private readonly regionNode?: { regionCode: string }) {
        super(initializeInterface<SamDeployWizardResponse>(), { region: regionNode?.regionCode })
        this.form.template.bindPrompter(() => context.createSamTemplatePrompter(), {
            after: async form => {
                const template = form.template!

                if (isImage(template)) {
                    // TODO: remove check when min version is high enough
                    const samCliVersion = await getSamCliVersion(this.context.extContext.samCliContext())
                    if (semver.lt(samCliVersion, MINIMUM_SAM_CLI_VERSION_INCLUSIVE_FOR_IMAGE_SUPPORT)) {
                        vscode.window.showErrorMessage(
                            localize(
                                'AWS.output.sam.no.image.support',
                                'Support for Image-based Lambdas requires a minimum SAM CLI version of 1.13.0.'
                            )
                        )
                        return WIZARD_GOBACK
                    }
                }
        
                const parameters = await this.context.getParameters(template)
                if (parameters.size < 1) {
                    form.parameterOverrides = new Map<string, string>()
                    return form
                }
        
                const requiredParameterNames = new Set<string>(
                    filter(parameters.keys(), name => parameters.get(name)!.required)
                )
                const overriddenParameters = await this.context.getOverriddenParameters(template)
                if (!overriddenParameters) {
                    // In there are no missing required parameters case, it isn't mandatory to override any parameters,
                    // but we still want to inform users of the option to override. Once we have prompted (i.e., if the
                    // parameter overrides section is empty instead of undefined), don't prompt again unless required.
                    this.context.additionalSteps++
        
                    const options = {
                        templateUri: this.response.template,
                        missingParameters: requiredParameterNames.size > 0 ? requiredParameterNames : undefined,
                    }
        
                    this.response.parameterOverrides = new Map<string, string>()
        
                    return getNextStep(await this.context.promptUserForParametersIfApplicable(options))
                }
        
                const missingParameters = difference(requiredParameterNames, overriddenParameters.keys())
                if (missingParameters.size > 0) {
                    this.context.additionalSteps++
        
                    return getNextStep(
                        await this.context.promptUserForParametersIfApplicable({
                            templateUri: this.response.template,
                            missingParameters,
                        })
                    )
                }
        
                this.response.parameterOverrides = overriddenParameters
        
                return wizardContinue(this.skipOrPromptRegion(this.S3_BUCKET))
            }
        })
        // TODO: support 'after' option that is asynchronous. Happens after user enters a valid input. Can modify state.
    }

    private readonly TEMPLATE: WizardStep = async () => {
        // set steps back to 0 since the next step determines if additional steps are needed
        this.context.additionalSteps = 0
        this.response.template = await this.context.promptUserForSamTemplate(this.response.template)

        if (!this.response.template) {
            return WIZARD_TERMINATE
        }

        // also ask user to setup CFN parameters if they haven't already done so
        const getNextStep = (result: ParameterPromptResult) => {
            switch (result) {
                case ParameterPromptResult.Cancel:
                    return WIZARD_TERMINATE
                case ParameterPromptResult.Continue:
                    return wizardContinue(this.skipOrPromptRegion(this.S3_BUCKET))
            }
        }

        if (this.hasImages) {
            // TODO: remove check when min version is high enough
            const samCliVersion = await getSamCliVersion(this.context.extContext.samCliContext())
            if (semver.lt(samCliVersion, MINIMUM_SAM_CLI_VERSION_INCLUSIVE_FOR_IMAGE_SUPPORT)) {
                vscode.window.showErrorMessage(
                    localize(
                        'AWS.output.sam.no.image.support',
                        'Support for Image-based Lambdas requires a minimum SAM CLI version of 1.13.0.'
                    )
                )
                return WIZARD_TERMINATE
            }

            this.context.additionalSteps++
        }

        const parameters = await this.context.getParameters(this.response.template)
        if (parameters.size < 1) {
            this.response.parameterOverrides = new Map<string, string>()

            return wizardContinue(this.skipOrPromptRegion(this.S3_BUCKET))
        }

        const requiredParameterNames = new Set<string>(
            filter(parameters.keys(), name => parameters.get(name)!.required)
        )
        const overriddenParameters = await this.context.getOverriddenParameters(this.response.template)
        if (!overriddenParameters) {
            // In there are no missing required parameters case, it isn't mandatory to override any parameters,
            // but we still want to inform users of the option to override. Once we have prompted (i.e., if the
            // parameter overrides section is empty instead of undefined), don't prompt again unless required.
            this.context.additionalSteps++

            const options = {
                templateUri: this.response.template,
                missingParameters: requiredParameterNames.size > 0 ? requiredParameterNames : undefined,
            }

            this.response.parameterOverrides = new Map<string, string>()

            return getNextStep(await this.context.promptUserForParametersIfApplicable(options))
        }

        const missingParameters = difference(requiredParameterNames, overriddenParameters.keys())
        if (missingParameters.size > 0) {
            this.context.additionalSteps++

            return getNextStep(
                await this.context.promptUserForParametersIfApplicable({
                    templateUri: this.response.template,
                    missingParameters,
                })
            )
        }

        this.response.parameterOverrides = overriddenParameters

        return wizardContinue(this.skipOrPromptRegion(this.S3_BUCKET))
    }

    private readonly REGION: WizardStep = async step => {
        this.response.region = await this.context.promptUserForRegion(step, this.response.region)

        return this.response.region ? wizardContinue(this.S3_BUCKET) : WIZARD_GOBACK
    }

    private readonly S3_BUCKET: WizardStep = async step => {
        const profile = this.context.extContext.awsContext.getCredentialProfileName() || ''
        const accountId = this.context.extContext.awsContext.getCredentialAccountId() || ''
        const response = await this.context.promptUserForS3Bucket(
            step,
            this.response.region!,
            profile,
            accountId,
            this.response.s3Bucket
        )

        if (!response) {
            return WIZARD_GOBACK
        }

        if (response === CREATE_NEW_BUCKET) {
            const newBucketRequest = await this.context.promptUserForS3BucketName(step, {
                title: localize('AWS.s3.createBucket.prompt', 'Enter a new bucket name'),
            })
            if (!newBucketRequest) {
                return WIZARD_RETRY
            }

            try {
                const s3Client = ext.toolkitClientBuilder.createS3Client(this.response.region!)
                const newBucketName = (await s3Client.createBucket({ bucketName: newBucketRequest })).bucket.name
                this.response.s3Bucket = newBucketName
                getLogger().info('Created bucket: %O', newBucketName)
                vscode.window.showInformationMessage(
                    localize('AWS.s3.createBucket.success', 'Created bucket: {0}', newBucketName)
                )
                telemetry.recordS3CreateBucket({ result: 'Succeeded' })
            } catch (e) {
                showErrorWithLogs(
                    localize('AWS.s3.createBucket.error.general', 'Failed to create bucket: {0}', newBucketRequest),
                    vscode.window
                )
                telemetry.recordS3CreateBucket({ result: 'Failed' })
                return WIZARD_RETRY
            }
        } else if (response === ENTER_BUCKET) {
            const bucket = await this.context.promptUserForS3BucketName(step, {
                title: localize('AWS.samcli.deploy.bucket.existingTitle', 'Enter Existing Bucket Name'),
                value: this.response.s3Bucket,
            })

            if (!bucket) {
                return WIZARD_RETRY
            }

            this.response.s3Bucket = bucket
        } else {
            this.response.s3Bucket = response
        }

        return this.hasImages ? wizardContinue(this.ECR_REPO) : wizardContinue(this.STACK_NAME)
    }

    private readonly ECR_REPO: WizardStep = async step => {
        const response = await this.context.promptUserForEcrRepo(step, this.response.region, this.response.ecrRepo)

        this.response.ecrRepo = response

        return response ? wizardContinue(this.STACK_NAME) : WIZARD_GOBACK
    }

    private readonly STACK_NAME: WizardStep = async () => {
        this.response.stackName = await this.context.promptUserForStackName({
            initialValue: this.response.stackName,
            validateInput: validateStackName,
        })

        return this.response.stackName ? WIZARD_TERMINATE : WIZARD_GOBACK
    }

    private skipOrPromptRegion(skipToStep: WizardStep): WizardStep {
        return this.regionNode && Object.prototype.hasOwnProperty.call(this.regionNode, 'regionCode')
            ? skipToStep
            : this.REGION
    }
}

function isImage(template?: CloudFormation.Template): boolean {
    const resources = template?.Resources

    return resources !== undefined && 
        Object.keys(resources)
            .filter(key => resources[key]?.Type === 'AWS::Serverless::Function')
            .map(key => resources[key]?.Properties?.PackageType)
            .some(it => it === 'Image')
}


class SamTemplateQuickPickItem implements DataQuickPickItem<CloudFormation.Template> {
    public readonly label: string

    public description?: string
    public detail?: string

    public constructor(
        public readonly template: CloudFormation.Template, 
        public readonly uri: vscode.Uri
    ) {
        this.label = SamTemplateQuickPickItem.getLabel(uri)
    }

    public showWorkspaceFolderDetails(): void {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(this.uri)

        if (workspaceFolder) {
            this.description = `in ${workspaceFolder.uri.fsPath}`
        }
    }

    public get data() { return this.template }

    public compareTo(rhs: SamTemplateQuickPickItem): number {
        const labelComp = this.label.localeCompare(rhs.label)
        if (labelComp !== 0) {
            return labelComp
        }

        const descriptionComp = (this.description || '').localeCompare(rhs.description || '')
        if (descriptionComp !== 0) {
            return descriptionComp
        }

        return (this.detail || '').localeCompare(rhs.detail || '')
    }

    public static getLabel(uri: vscode.Uri): string {
        const logger = getLogger()
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)

        if (workspaceFolder) {
            // If workspace is /usr/foo/code and uri is /usr/foo/code/processor/template.yaml,
            // show "processor/template.yaml"
            return path.relative(workspaceFolder.uri.fsPath, uri.fsPath)
        }

        // We shouldn't find sam templates outside of a workspace folder. If we do, show the full path.
        logger.warn(`Unexpected situation: detected SAM Template ${uri.fsPath} not found within a workspace folder.`)

        return uri.fsPath
    }
}

// https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_CreateStack.html
// A stack name can contain only alphanumeric characters (case sensitive) and hyphens.
// It must start with an alphabetic character and cannot be longer than 128 characters.
function validateStackName(value: string): string | undefined {
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

function getTemplateChoices(...workspaceFolders: vscode.Uri[]): SamTemplateQuickPickItem[] {
    const templates = ext.templateRegistry.registeredItems
    const templateToLabel: Map<CloudFormation.Template, string> = new Map()
    const labelCounts: Map<string, number> = new Map()

    const templateItems = templates.map(template => {
        const uri =vscode.Uri.file(template.path)
        const label = SamTemplateQuickPickItem.getLabel(uri)

        templateToLabel.set(template.item, label)
        labelCounts.set(label, 1 + (labelCounts.get(label) || 0))

        return new SamTemplateQuickPickItem(template.item, uri)
    }).map(item => {
        if (labelCounts.get(item.label)! > 1) {
            item.showWorkspaceFolderDetails()
        }
        return item
    }).sort((a, b) => a.compareTo(b))

    return templateItems
}

const NEW_BUCKET_OPTION = Symbol()
const ENTER_BUCKET_OPTION = Symbol()

/**
 * Loads S3 buckets into a quick pick.
 * Fully replaces the quick pick's `items` field on loading S3 buckets.
 * Operation is not paginated as S3 does not offer paginated listing of regionalized buckets.
 * @param quickPick Quick pick to modify the items and busy/enabled state of.
 * @param selectedRegion AWS region to display buckets for
 * @param settings SettingsConfiguration object to get stored settings
 * @param messages Messages to denote no available buckets and errors.
 */
async function populateS3QuickPick(
    quickPick: DataQuickPick<string>,
    selectedRegion: string,
    settings: SettingsConfiguration,
    messages: { noBuckets: string; bucketError: string },
    profile?: string,
    accountId?: string
): Promise<void> {
    const goBack: string = localize('AWS.picker.dynamic.noItemsFound.detail', 'Click here to go back')
    const baseItems: DataQuickPickItem<string>[] = []
    const cloud9Bucket = `cloud9-${accountId}-sam-deployments-${selectedRegion}`

    let recent: string = ''
    try {
        const existingBuckets = readSavedBuckets(settings)
        if (existingBuckets && profile && existingBuckets[profile] && existingBuckets[profile][selectedRegion]) {
            recent = existingBuckets[profile][selectedRegion]
            baseItems.push({
                label: recent,
                description: localize('AWS.profile.recentlyUsed', 'recently used'),
            })
        }
    } catch (e) {
        getLogger().error('Recent bucket JSON not parseable.', e)
    }

    if (isCloud9() && recent !== cloud9Bucket) {
        baseItems.push({
            label: cloud9Bucket,
            detail: localize('AWS.samcli.deploy.bucket.cloud9name', 'Default AWS Cloud9 Bucket'),
        })
    }

    try {
        const s3Client = ext.toolkitClientBuilder.createS3Client(selectedRegion)

        quickPick.items = [...baseItems]

        const buckets = (await s3Client.listBuckets()).buckets

        if (buckets.length === 0) {
            quickPick.items = [
                ...baseItems,
                { label: CREATE_NEW_BUCKET, data: NEW_BUCKET_OPTION },
                { label: ENTER_BUCKET, data: ENTER_BUCKET_OPTION },
                {
                    label: messages.noBuckets,
                    data: WIZARD_GOBACK,
                    description: goBack,
                },
            ]
        } else {
            const bucketItems = buckets
                .filter(bucket => bucket.name !== recent && !(isCloud9() && bucket.name === cloud9Bucket))
                .map(bucket => {
                    return {
                        label: bucket.name,
                    }
                })

            quickPick.items = [...baseItems, ...bucketItems]
        }
    } catch (e) {
        const err = e as Error
        quickPick.items = [
            ...baseItems,
            { label: CREATE_NEW_BUCKET, data: NEW_BUCKET_OPTION },
            { label: ENTER_BUCKET, data: ENTER_BUCKET_OPTION },
            {
                label: messages.bucketError,
                description: goBack,
                data: WIZARD_GOBACK,
                detail: err.message,
            },
        ]
    } finally {
        quickPick.busy = false
    }
}