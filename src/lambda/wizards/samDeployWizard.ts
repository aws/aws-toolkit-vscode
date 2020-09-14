/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import * as _ from 'lodash'

const localize = nls.loadMessageBundle()

import * as path from 'path'
import * as vscode from 'vscode'
import { AwsContext } from '../../shared/awsContext'
import { samDeployDocUrl } from '../../shared/constants'
import { getLogger } from '../../shared/logger'
import { RegionProvider } from '../../shared/regions/regionProvider'
import { getRegionsForActiveCredentials } from '../../shared/regions/regionUtilities'
import { createHelpButton } from '../../shared/ui/buttons'
import * as input from '../../shared/ui/input'
import * as picker from '../../shared/ui/picker'
import { difference, filter } from '../../shared/utilities/collectionUtils'
import { MultiStepWizard, WizardStep } from '../../shared/wizards/multiStepWizard'
import { configureParameterOverrides } from '../config/configureParameterOverrides'
import { getOverriddenParameters, getParameters } from '../utilities/parameterUtils'
import { CloudFormationTemplateRegistry } from '../../shared/cloudformation/templateRegistry'
import { ext } from '../../shared/extensionGlobals'

export interface SamDeployWizardResponse {
    parameterOverrides: Map<string, string>
    region: string
    template: vscode.Uri
    s3Bucket: string
    stackName: string
}

export const enum ParameterPromptResult {
    Cancel,
    Continue,
}

export interface SamDeployWizardContext {
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
    promptUserForSamTemplate(initialValue?: vscode.Uri): Promise<vscode.Uri | undefined>

    /**
     * Prompts the user to configure parameter overrides, then either pre-fills and opens
     * `templates.json`, or returns true.
     *
     * @param options.templateUri The URL of the SAM template to inspect.
     * @param options.missingParameters The names of required parameters that are not yet overridden.
     * @returns A value indicating whether the wizard should proceed. `false` if `missingParameters` was
     *          non-empty, or if it was empty and the user opted to configure overrides instead of continuing.
     */
    promptUserForParametersIfApplicable(options: {
        templateUri: vscode.Uri
        missingParameters?: Set<string>
    }): Promise<ParameterPromptResult>

    promptUserForRegion(initialValue?: string): Promise<string | undefined>

    /**
     * Retrieves an S3 Bucket to deploy to from the user.
     *
     * @param initialValue Optional, Initial value to prompt with
     *
     * @returns S3 Bucket name. Undefined represents cancel.
     */
    promptUserForS3Bucket(selectedRegion?: string, initialValue?: string): Promise<string | undefined>

    /**
     * Retrieves a Stack Name to deploy to from the user.
     *
     * @param initialValue Optional, Initial value to prompt with
     * @param validateInput Optional, validates input as it is entered
     *
     * @returns Stack name. Undefined represents cancel.
     */
    promptUserForStackName({
        initialValue,
        validateInput,
    }: {
        initialValue?: string
        validateInput(value: string): string | undefined
    }): Promise<string | undefined>
}

function getSingleResponse(responses: vscode.QuickPickItem[] | undefined): string | undefined {
    if (!responses) {
        return undefined
    }

    if (responses.length !== 1) {
        throw new Error(`Expected a single response, but got ${responses.length}`)
    }

    return responses[0].label
}

export class DefaultSamDeployWizardContext implements SamDeployWizardContext {
    public readonly getParameters = getParameters
    public readonly getOverriddenParameters = getOverriddenParameters
    private readonly helpButton = createHelpButton(localize('AWS.command.help', 'View Toolkit Documentation'))

    public constructor(private readonly regionProvider: RegionProvider, private readonly awsContext: AwsContext) {}

    public get workspaceFolders(): vscode.Uri[] | undefined {
        return (vscode.workspace.workspaceFolders || []).map(f => f.uri)
    }

    /**
     * Retrieves the URI of a Sam template to deploy from the user
     *
     * @returns vscode.Uri of a Sam Template. undefined represents cancel.
     */
    public async promptUserForSamTemplate(initialValue?: vscode.Uri): Promise<vscode.Uri | undefined> {
        const workspaceFolders = this.workspaceFolders || []

        const quickPick = picker.createQuickPick<SamTemplateQuickPickItem>({
            options: {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.samcli.deploy.template.prompt',
                    'Which SAM Template would you like to deploy to AWS?'
                ),
            },
            buttons: [this.helpButton, vscode.QuickInputButtons.Back],
            items: await getTemplateChoices(...workspaceFolders),
        })

        const choices = await picker.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                } else if (button === this.helpButton) {
                    vscode.env.openExternal(vscode.Uri.parse(samDeployDocUrl))
                }
            },
        })
        const val = picker.verifySinglePickerOutput<SamTemplateQuickPickItem>(choices)

        return val ? val.uri : undefined
    }

    public async promptUserForParametersIfApplicable({
        templateUri,
        missingParameters = new Set<string>(),
    }: {
        templateUri: vscode.Uri
        missingParameters?: Set<string>
    }): Promise<ParameterPromptResult> {
        if (missingParameters.size < 1) {
            const prompt = localize(
                'AWS.samcli.deploy.parameters.optionalPrompt.message',
                // prettier-ignore
                'The template {0} contains parameters. Would you like to override the default values for these parameters?',
                templateUri.fsPath
            )
            const responseYes = localize('AWS.samcli.deploy.parameters.optionalPrompt.responseYes', 'Yes')
            const responseNo = localize('AWS.samcli.deploy.parameters.optionalPrompt.responseNo', 'No')

            const quickPick = picker.createQuickPick<vscode.QuickPickItem>({
                options: {
                    ignoreFocusOut: true,
                    title: prompt,
                },
                buttons: [this.helpButton, vscode.QuickInputButtons.Back],
                items: [{ label: responseYes }, { label: responseNo }],
            })
            const response = getSingleResponse(
                await picker.promptUser({
                    picker: quickPick,
                    onDidTriggerButton: (button, resolve, reject) => {
                        if (button === vscode.QuickInputButtons.Back) {
                            resolve(undefined)
                        } else if (button === this.helpButton) {
                            vscode.env.openExternal(vscode.Uri.parse(samDeployDocUrl))
                        }
                    },
                })
            )
            if (response !== responseYes) {
                return ParameterPromptResult.Continue
            }

            await configureParameterOverrides({
                templateUri,
                requiredParameterNames: missingParameters.keys(),
            })

            return ParameterPromptResult.Cancel
        } else {
            const prompt = localize(
                'AWS.samcli.deploy.parameters.mandatoryPrompt.message',
                // prettier-ignore
                'The template {0} contains parameters without default values. In order to deploy, you must provide values for these parameters. Configure them now?',
                templateUri.fsPath
            )
            const responseConfigure = localize(
                'AWS.samcli.deploy.parameters.mandatoryPrompt.responseConfigure',
                'Configure'
            )
            const responseCancel = localize('AWS.samcli.deploy.parameters.mandatoryPrompt.responseCancel', 'Cancel')

            const quickPick = picker.createQuickPick<vscode.QuickPickItem>({
                options: {
                    ignoreFocusOut: true,
                    title: prompt,
                },
                buttons: [this.helpButton, vscode.QuickInputButtons.Back],
                items: [{ label: responseConfigure }, { label: responseCancel }],
            })
            const response = getSingleResponse(
                await picker.promptUser({
                    picker: quickPick,
                    onDidTriggerButton: (button, resolve, reject) => {
                        if (button === vscode.QuickInputButtons.Back) {
                            resolve(undefined)
                        } else if (button === this.helpButton) {
                            vscode.env.openExternal(vscode.Uri.parse(samDeployDocUrl))
                        }
                    },
                })
            )
            if (response === responseConfigure) {
                await configureParameterOverrides({
                    templateUri,
                    requiredParameterNames: missingParameters.keys(),
                })
            }

            return ParameterPromptResult.Cancel
        }
    }

    public async promptUserForRegion(initialRegionCode?: string): Promise<string | undefined> {
        const partitionRegions = getRegionsForActiveCredentials(this.awsContext, this.regionProvider)

        const quickPick = picker.createQuickPick<vscode.QuickPickItem>({
            options: {
                title: localize('AWS.samcli.deploy.region.prompt', 'Which AWS Region would you like to deploy to?'),
                value: initialRegionCode,
                matchOnDetail: true,
                ignoreFocusOut: true,
            },
            items: partitionRegions.map(region => ({
                label: region.name,
                detail: region.id,
                // this is the only way to get this to show on going back
                // this will make it so it always shows even when searching for something else
                alwaysShow: region.id === initialRegionCode,
                description:
                    region.id === initialRegionCode
                        ? localize('AWS.wizard.selectedPreviously', 'Selected Previously')
                        : '',
            })),
            buttons: [this.helpButton, vscode.QuickInputButtons.Back],
        })

        const choices = await picker.promptUser<vscode.QuickPickItem>({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                } else if (button === this.helpButton) {
                    vscode.env.openExternal(vscode.Uri.parse(samDeployDocUrl))
                }
            },
        })
        const val = picker.verifySinglePickerOutput(choices)

        return val?.detail
    }

    /**
     * Retrieves an S3 Bucket to deploy to from the user.
     *
     * @param selectedRegion Selected region for S3 client usage
     * @param initialValue Optional, Initial value to prompt with
     * @param messages Passthrough strings for testing
     *
     * @returns S3 Bucket name. Undefined represents cancel.
     */
    public async promptUserForS3Bucket(
        selectedRegion: string,
        initialValue: string | undefined = undefined,
        messages: {
            noBuckets: string
            bucketError: string
        } = {
            noBuckets: localize('AWS.samcli.deploy.s3bucket.picker.noBuckets', 'No buckets found.'),
            bucketError: localize('AWS.samcli.deploy.s3bucket.picker.error', 'There was an error loading S3 buckets.'),
        }
    ): Promise<string | undefined> {
        const loadingBuckets: string = localize('AWS.samcli.deploy.s3bucket.picker.loading', 'Loading S3 buckets...')

        const quickPick = picker.createQuickPick<vscode.QuickPickItem>({
            buttons: [this.helpButton, vscode.QuickInputButtons.Back],
            options: {
                title: localize('AWS.samcli.deploy.s3Bucket.prompt', 'Select an AWS S3 Bucket to deploy code to'),
                value: initialValue,
                matchOnDetail: true,
                ignoreFocusOut: true,
            },
            items: [
                {
                    label: loadingBuckets,
                },
            ],
        })

        quickPick.busy = true
        quickPick.enabled = false

        // NOTE: Do not await this promise.
        // This will background load the S3 buckets and load them all (in one chunk) when the operation completes.
        // Not awaiting lets us display a "loading" quick pick for immediate feedback.
        // Does not use an IteratingQuickPick because listing S3 buckets by region is not a paginated operation.
        populateS3QuickPick(quickPick, selectedRegion, messages)

        const choices = await picker.promptUser<vscode.QuickPickItem>({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                } else if (button === this.helpButton) {
                    vscode.env.openExternal(vscode.Uri.parse(samDeployDocUrl))
                }
            },
        })
        const val = picker.verifySinglePickerOutput(choices)

        return val?.label && ![loadingBuckets, messages.noBuckets, messages.bucketError].includes(val.label)
            ? val.label
            : undefined
    }

    /**
     * Retrieves a Stack Name to deploy to from the user.
     *
     * @param initialValue Optional, Initial value to prompt with
     * @param validateInput Optional, validates input as it is entered
     *
     * @returns Stack name. Undefined represents cancel.
     */
    public async promptUserForStackName({
        initialValue,
        validateInput,
    }: {
        initialValue?: string
        validateInput(value: string): string | undefined
    }): Promise<string | undefined> {
        const inputBox = input.createInputBox({
            buttons: [this.helpButton, vscode.QuickInputButtons.Back],
            options: {
                title: localize('AWS.samcli.deploy.stackName.prompt', 'Enter the name to use for the deployed stack'),
                ignoreFocusOut: true,
            },
        })

        // Pre-populate the value if it was already set
        if (initialValue) {
            inputBox.value = initialValue
        }

        return await input.promptUser({
            inputBox: inputBox,
            onValidateInput: validateInput,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                } else if (button === this.helpButton) {
                    vscode.env.openExternal(vscode.Uri.parse(samDeployDocUrl))
                }
            },
        })
    }
}

export class SamDeployWizard extends MultiStepWizard<SamDeployWizardResponse> {
    private readonly response: Partial<SamDeployWizardResponse> = {}

    public constructor(private readonly context: SamDeployWizardContext) {
        super()
    }

    protected get startStep() {
        return this.TEMPLATE
    }

    protected getResult(): SamDeployWizardResponse | undefined {
        if (
            !this.response.parameterOverrides ||
            !this.response.template ||
            !this.response.region ||
            !this.response.s3Bucket ||
            !this.response.stackName
        ) {
            return undefined
        }

        return {
            parameterOverrides: this.response.parameterOverrides,
            template: this.response.template,
            region: this.response.region,
            s3Bucket: this.response.s3Bucket,
            stackName: this.response.stackName,
        }
    }

    private readonly TEMPLATE: WizardStep = async () => {
        this.response.template = await this.context.promptUserForSamTemplate(this.response.template)

        return this.response.template ? this.PARAMETER_OVERRIDES : undefined
    }

    private readonly PARAMETER_OVERRIDES: WizardStep = async () => {
        const getNextStep = (result: ParameterPromptResult) => {
            switch (result) {
                case ParameterPromptResult.Cancel:
                    return undefined
                case ParameterPromptResult.Continue:
                    return this.REGION
            }
        }

        if (!this.response.template) {
            throw new Error('Unexpected state: TEMPLATE step is complete, but no template was selected')
        }

        const parameters = await this.context.getParameters(this.response.template)
        if (parameters.size < 1) {
            this.response.parameterOverrides = new Map<string, string>()

            return this.REGION
        }

        const requiredParameterNames = new Set<string>(
            filter(parameters.keys(), name => parameters.get(name)!.required)
        )
        const overriddenParameters = await this.context.getOverriddenParameters(this.response.template)
        if (!overriddenParameters) {
            // In there are no missing required parameters case, it isn't mandatory to override any parameters,
            // but we still want to inform users of the option to override. Once we have prompted (i.e., if the
            // parameter overrides section is empty instead of undefined), don't prompt again unless required.
            const options = {
                templateUri: this.response.template,
                missingParameters: requiredParameterNames.size > 0 ? requiredParameterNames : undefined,
            }

            this.response.parameterOverrides = new Map<string, string>()

            return getNextStep(await this.context.promptUserForParametersIfApplicable(options))
        }

        const missingParameters = difference(requiredParameterNames, overriddenParameters.keys())
        if (missingParameters.size > 0) {
            return getNextStep(
                await this.context.promptUserForParametersIfApplicable({
                    templateUri: this.response.template,
                    missingParameters,
                })
            )
        }

        this.response.parameterOverrides = overriddenParameters

        return this.REGION
    }

    private readonly REGION: WizardStep = async () => {
        this.response.region = await this.context.promptUserForRegion(this.response.region)

        // The PARAMETER_OVERRIDES step is part of the TEMPLATE step from the user's perspective,
        // so we go back to the TEMPLATE step instead of PARAMETER_OVERRIDES.
        return this.response.region ? this.S3_BUCKET : this.TEMPLATE
    }

    private readonly S3_BUCKET: WizardStep = async () => {
        this.response.s3Bucket = await this.context.promptUserForS3Bucket(this.response.region, this.response.s3Bucket)

        return this.response.s3Bucket ? this.STACK_NAME : this.REGION
    }

    private readonly STACK_NAME: WizardStep = async () => {
        this.response.stackName = await this.context.promptUserForStackName({
            initialValue: this.response.stackName,
            validateInput: validateStackName,
        })

        return this.response.stackName ? undefined : this.S3_BUCKET
    }
}

class SamTemplateQuickPickItem implements vscode.QuickPickItem {
    public readonly label: string

    public description?: string
    public detail?: string

    public constructor(public readonly uri: vscode.Uri, showWorkspaceFolderDetails: boolean) {
        this.label = SamTemplateQuickPickItem.getLabel(uri)

        if (showWorkspaceFolderDetails) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)

            if (workspaceFolder) {
                this.description = `in ${workspaceFolder.uri.fsPath}`
            }
        }
    }

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

async function getTemplateChoices(...workspaceFolders: vscode.Uri[]): Promise<SamTemplateQuickPickItem[]> {
    const cfnRegistry = CloudFormationTemplateRegistry.getRegistry()
    const templateUris = cfnRegistry.registeredTemplates.map(o => vscode.Uri.file(o.path))
    const uriToLabel: Map<vscode.Uri, string> = new Map<vscode.Uri, string>()
    const labelCounts: Map<string, number> = new Map()

    templateUris.forEach(uri => {
        const label = SamTemplateQuickPickItem.getLabel(uri)
        uriToLabel.set(uri, label)
        labelCounts.set(label, 1 + (labelCounts.get(label) || 0))
    })

    return Array.from(uriToLabel, ([uri, label]) => {
        const showWorkspaceFolderDetails: boolean = (labelCounts.get(label) || 0) > 1

        return new SamTemplateQuickPickItem(uri, showWorkspaceFolderDetails)
    }).sort((a, b) => a.compareTo(b))
}

/**
 * Loads S3 buckets into a quick pick.
 * Fully replaces the quick pick's `items` field on loading S3 buckets.
 * Operation is not paginated as S3 does not offer paginated listing of regionalized buckets.
 * @param quickPick Quick pick to modify the items and busy/enabled state of.
 * @param selectedRegion AWS region to display buckets for
 * @param messages Messages to denote no available buckets and errors.
 */
async function populateS3QuickPick(
    quickPick: vscode.QuickPick<vscode.QuickPickItem>,
    selectedRegion: string,
    messages: { noBuckets: string; bucketError: string }
): Promise<void> {
    return new Promise(async resolve => {
        const goBack: string = localize('AWS.picker.dynamic.noItemsFound.detail', 'Click here to go back')

        try {
            const s3Client = ext.toolkitClientBuilder.createS3Client(selectedRegion)

            const buckets = await s3Client.listBuckets()

            quickPick.items = buckets.buckets.map(bucket => {
                return {
                    label: bucket.name,
                }
            })

            if (quickPick.items.length === 0) {
                quickPick.items = [
                    {
                        label: messages.noBuckets,
                        description: goBack,
                    },
                ]
            }
        } catch (e) {
            const err = e as Error
            quickPick.items = [
                {
                    label: messages.bucketError,
                    description: goBack,
                    detail: err.message,
                },
            ]
        } finally {
            quickPick.busy = false
            quickPick.enabled = true
            resolve()
        }
    })
}
