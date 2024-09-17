/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import {
    TemplateItem,
    createBucketPrompter,
    createStackPrompter,
    createTemplatePrompter,
    getSamCliPathAndVersion,
    injectCredentials,
    runInTerminal,
} from '../../shared/sam/sync'
import * as localizedText from '../../shared/localizedText'
import { DataQuickPickItem, createQuickPick } from '../../shared/ui/pickerPrompter'
import { createCommonButtons } from '../../shared/ui/buttons'
import { credentialHelpUrl, samDeployUrl } from '../../shared/constants'
import { Wizard } from '../../shared/wizards/wizard'
import { CloudFormationTemplateRegistry } from '../../shared/fs/templateRegistry'
import { createExitPrompter } from '../../shared/ui/common/exitPrompter'
import { createRegionPrompter } from '../../shared/ui/common/region'
import { DefaultCloudFormationClient } from '../../shared/clients/cloudFormationClient'
import { DefaultS3Client } from '../../shared/clients/s3Client'
import { ToolkitError, globals } from '../../shared'
import { promptAndUseConnection } from '../../auth/utils'
import { Auth } from '../../auth'
import { SamConfig } from '../../shared/sam/config'
import { showMessageWithUrl } from '../../shared/utilities/messages'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { ChildProcess } from '../../shared/utilities/childProcess'
import { addTelemetryEnvVar } from '../../shared/sam/cli/samCliInvokerUtils'
import { getProjectRootFoldersInWorkspace, getProjectRootUri, getSource } from '../../shared/sam/utils'
import { telemetry } from '../../shared/telemetry'
import { getParameters } from '../config/parameterUtils'
import { filter } from '../../shared/utilities/collectionUtils'
import { createInputBox } from '../../shared/ui/inputPrompter'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

interface DeployParams {
    readonly paramsSource: ParamsSource
    readonly template: TemplateItem
    readonly region: string
    readonly stackName: string
    readonly bucketSource: BucketSource
    readonly bucketName: string
    readonly projectRoot: vscode.Uri

    [key: string]: any
}

function createParamPromptProvider(name: string) {
    return createInputBox({
        title: `Specify SAM parameter value for ${name}`,
        buttons: createCommonButtons(samDeployUrl),
    })
}

function bucketSourcePrompter() {
    const items: DataQuickPickItem<BucketSource>[] = [
        {
            label: 'Create a SAM CLI managed S3 bucket',
            data: BucketSource.SamCliManaged,
        },
        {
            label: 'Specify an S3 bucket',
            data: BucketSource.UserProvided,
        },
    ]

    return createQuickPick(items, {
        title: 'Specify S3 bucket for deployment artifacts',
        placeholder: 'Press enter to proceed with highlighted option',
        buttons: createCommonButtons(samDeployUrl),
    })
}

function paramsSourcePrompter(existValidSamconfig: boolean | undefined) {
    const items: DataQuickPickItem<ParamsSource>[] = [
        {
            label: 'Specify only required parameters and save as defaults',
            data: ParamsSource.SpecifyAndSave,
        },
        {
            label: 'Specify only required parameters',
            data: ParamsSource.Specify,
        },
    ]

    if (existValidSamconfig) {
        items.push({
            label: 'Use default values from samconfig',
            data: ParamsSource.SamConfig,
        })
    }

    return createQuickPick(items, {
        title: 'Specify parameters for deploy',
        placeholder: 'Press enter to proceed with highlighted option',
        buttons: createCommonButtons(samDeployUrl),
    })
}

function workspaceFolderPrompter(projectRootFolders: vscode.Uri[] | undefined) {
    if (projectRootFolders === undefined) {
        throw new ToolkitError('No Workspace folder found')
    }
    const items = projectRootFolders?.map((workspaceFolder) => {
        return { label: workspaceFolder.path, data: workspaceFolder }
    })

    return createQuickPick(items, {
        title: 'Select workspace folder',
        placeholder: 'Press enter to proceed with highlighted option',
        buttons: createCommonButtons(samDeployUrl),
    })
}

type DeployResult = {
    isSuccess: boolean
}

enum BucketSource {
    SamCliManaged,
    UserProvided,
}
enum ParamsSource {
    SpecifyAndSave,
    Specify,
    SamConfig,
}

class DeployWizard extends Wizard<DeployParams> {
    registry: CloudFormationTemplateRegistry
    state: Partial<DeployParams>
    arg: any
    public constructor(state: Partial<DeployParams>, registry: CloudFormationTemplateRegistry, arg?: any) {
        super({ initState: state, exitPrompterProvider: createExitPrompter })
        this.registry = registry
        this.state = state
        this.arg = arg
    }

    public override async init(): Promise<this> {
        const getProjectRoot = (template: TemplateItem | undefined) =>
            template ? getProjectRootUri(template.uri) : undefined

        const projectRootFolders = await getProjectRootFoldersInWorkspace()

        if (this.arg && this.arg.path) {
            // "Deploy" command was invoked on a template.yaml file.
            const templateUri = this.arg as vscode.Uri
            const templateItem = { uri: templateUri, data: {} } as TemplateItem
            const projectRootFolder = getProjectRoot(templateItem)
            const existValidSamConfig: boolean | undefined = await SamConfig.validateSamDeployConfig(projectRootFolder)

            await this.addParameterPromptersIfApplicable(templateUri)

            this.form.template.setDefault(templateItem)
            this.form.projectRoot.setDefault(() => projectRootFolder)
            this.form.paramsSource.bindPrompter(() => paramsSourcePrompter(existValidSamConfig))

            this.form.region.bindPrompter(() => createRegionPrompter().transform((r) => r.id), {
                showWhen: ({ paramsSource }) =>
                    paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
            })
            this.form.stackName.bindPrompter(
                ({ region }) => createStackPrompter(new DefaultCloudFormationClient(region!)),
                {
                    showWhen: ({ paramsSource }) =>
                        paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
                }
            )
            this.form.bucketSource.bindPrompter(() => bucketSourcePrompter(), {
                showWhen: ({ paramsSource }) =>
                    paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
            })
            this.form.bucketName.bindPrompter(({ region }) => createBucketPrompter(new DefaultS3Client(region!)), {
                showWhen: ({ bucketSource }) => bucketSource === BucketSource.UserProvided,
            })
        } else if (this.arg && this.arg.regionCode) {
            // "Deploy" command was invoked on a regionNode.
            this.form.projectRoot.bindPrompter(() => workspaceFolderPrompter(projectRootFolders), {
                showWhen: () => projectRootFolders.length > 1,
                setDefault: () => projectRootFolders[0],
            })
            this.form.paramsSource.bindPrompter(async ({ projectRoot }) => {
                const existValidSamConfig: boolean | undefined = await SamConfig.validateSamDeployConfig(projectRoot)
                return paramsSourcePrompter(existValidSamConfig)
            })
            this.form.template.bindPrompter(({ projectRoot }) => createTemplatePrompter(this.registry, projectRoot), {
                showWhen: ({ paramsSource }) =>
                    paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
            })
            this.form.region.setDefault(() => this.arg.regionCode)
            this.form.stackName.bindPrompter(
                ({ region }) => createStackPrompter(new DefaultCloudFormationClient(region!)),
                {
                    showWhen: ({ paramsSource }) =>
                        paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
                }
            )
            this.form.bucketSource.bindPrompter(() => bucketSourcePrompter(), {
                showWhen: ({ paramsSource }) =>
                    paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
            })
            this.form.bucketName.bindPrompter(({ region }) => createBucketPrompter(new DefaultS3Client(region!)), {
                showWhen: ({ bucketSource }) => bucketSource === BucketSource.UserProvided,
            })
        } else if (this.arg && this.arg.getTreeItem().resourceUri) {
            // "Deploy" command was invoked on a TreeNode on the AppBuilder.
            const templateUri = this.arg.getTreeItem().resourceUri as vscode.Uri
            const templateItem = { uri: templateUri, data: {} } as TemplateItem
            const projectRootFolder = getProjectRoot(templateItem)
            const existValidSamConfig: boolean | undefined = await SamConfig.validateSamDeployConfig(projectRootFolder)

            await this.addParameterPromptersIfApplicable(templateUri)

            this.form.template.setDefault(templateItem)
            this.form.paramsSource.bindPrompter(() => paramsSourcePrompter(existValidSamConfig))

            this.form.region.bindPrompter(() => createRegionPrompter().transform((r) => r.id), {
                showWhen: ({ paramsSource }) =>
                    paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
            })
            this.form.stackName.bindPrompter(
                ({ region }) => createStackPrompter(new DefaultCloudFormationClient(region!)),
                {
                    showWhen: ({ paramsSource }) =>
                        paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
                }
            )
            this.form.bucketSource.bindPrompter(() => bucketSourcePrompter(), {
                showWhen: ({ paramsSource }) =>
                    paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
            })
            this.form.bucketName.bindPrompter(({ region }) => createBucketPrompter(new DefaultS3Client(region!)), {
                showWhen: ({ bucketSource }) => bucketSource === BucketSource.UserProvided,
            })
            this.form.projectRoot.setDefault(() => getProjectRoot(templateItem))
        } else {
            // "Deploy" command was invoked on the command palette.
            this.form.projectRoot.bindPrompter(() => workspaceFolderPrompter(projectRootFolders), {
                showWhen: () => projectRootFolders.length > 1,
                setDefault: () => projectRootFolders[0],
            })
            this.form.paramsSource.bindPrompter(async ({ projectRoot }) => {
                const existValidSamConfig: boolean | undefined = await SamConfig.validateSamDeployConfig(projectRoot)
                return paramsSourcePrompter(existValidSamConfig)
            })
            this.form.template.bindPrompter(({ projectRoot }) => createTemplatePrompter(this.registry, projectRoot), {
                showWhen: ({ paramsSource }) =>
                    paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
            })
            this.form.region.bindPrompter(() => createRegionPrompter().transform((r) => r.id), {
                showWhen: ({ paramsSource }) =>
                    paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
            })
            this.form.stackName.bindPrompter(
                ({ region }) => createStackPrompter(new DefaultCloudFormationClient(region!)),
                {
                    showWhen: ({ paramsSource }) =>
                        paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
                }
            )
            this.form.bucketSource.bindPrompter(() => bucketSourcePrompter(), {
                showWhen: ({ paramsSource }) =>
                    paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
            })
            this.form.bucketName.bindPrompter(({ region }) => createBucketPrompter(new DefaultS3Client(region!)), {
                showWhen: ({ bucketSource }) => bucketSource === BucketSource.UserProvided,
            })
        }

        return this
    }

    /**
     * Parse the template for parameters and add prompters for them if applicable.
     * @param templateUri the uri of the template
     */
    async addParameterPromptersIfApplicable(templateUri: vscode.Uri) {
        const samTemplateParameters = await getParameters(templateUri)
        if (samTemplateParameters.size > 0) {
            const requiredParameterNames = new Set<string>(
                filter(samTemplateParameters.keys(), (name) => samTemplateParameters.get(name)!.required)
            )

            requiredParameterNames.forEach((name) => {
                this.form[name].bindPrompter(() => createParamPromptProvider(name))
            })
        }
    }
}

async function getAuthOrPrompt() {
    const connection = Auth.instance.activeConnection
    if (connection?.type === 'iam' && connection.state === 'valid') {
        return connection
    }
    let errorMessage = localize(
        'aws.appBuilder.deploy.authModal.message',
        'Deploying requires authentication with IAM credentials.'
    )
    if (connection?.state === 'valid') {
        errorMessage =
            localize(
                'aws.appBuilder.deploy.authModal.invalidAuth',
                'Authentication through Builder ID or IAM Identity Center detected. '
            ) + errorMessage
    }
    const authPrompt = localize('aws.appBuilder.deploy.authModal.accept', 'Authenticate with IAM credentials')
    const modalResponse = await showMessageWithUrl(
        errorMessage,
        credentialHelpUrl,
        localizedText.viewDocs,
        'info',
        [authPrompt],
        true
    )
    if (modalResponse !== authPrompt) {
        return
    }
    await promptAndUseConnection(Auth.instance, 'iam-only')
    return Auth.instance.activeConnection
}

async function getConfigFileUri(projectRoot: vscode.Uri) {
    const samConfigFilename = 'samconfig'
    const samConfigFile = (
        await vscode.workspace.findFiles(new vscode.RelativePattern(projectRoot, `${samConfigFilename}.*`))
    )[0]
    if (samConfigFile) {
        return samConfigFile
    } else {
        throw new ToolkitError(`No samconfig.toml file found in ${projectRoot.fsPath}`)
    }
}

export async function runDeploy(arg: any): Promise<DeployResult> {
    return await telemetry.sam_deploy.run(async () => {
        const source = getSource(arg)
        telemetry.record({ source: source })

        const connection = await getAuthOrPrompt()
        if (connection?.type !== 'iam' || connection?.state !== 'valid') {
            throw new ToolkitError('Deploying SAM applications requires IAM credentials', {
                code: 'NoIAMCredentials',
            })
        }

        // Prepare Build params
        const deployParams: Partial<DeployParams> = {}

        const registry = await globals.templateRegistry
        const params = await new DeployWizard(deployParams, registry, arg).run()
        if (params === undefined) {
            throw new CancellationError('user')
        }

        const deployFlags: string[] = ['--no-confirm-changeset']
        const buildFlags: string[] = ['--cached']

        if (params.paramsSource === ParamsSource.SamConfig) {
            const samConfigFile = await getConfigFileUri(params.projectRoot)
            deployFlags.push('--config-file', `${samConfigFile.fsPath}`)
        } else {
            deployFlags.push('--template', `${params.template.uri.fsPath}`)
            deployFlags.push('--region', `${params.region}`)
            deployFlags.push('--stack-name', `${params.stackName}`)
            params.bucketName
                ? deployFlags.push('--s3-bucket', `${params.bucketName}`)
                : deployFlags.push('--resolve-s3')
            deployFlags.push('--capabilities', 'CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM')
            const samTemplateParameters = await getParameters(params.template.uri)

            const requiredParameterNames = new Set<string>(
                filter(samTemplateParameters.keys(), (name) => samTemplateParameters.get(name)!.required)
            )

            const paramsToSet: string[] = []
            requiredParameterNames.forEach((name) => {
                if (params[name]) {
                    paramsToSet.push(`ParameterKey=${name},ParameterValue=${params[name]}`)
                }
                deployFlags.push('--parameter-overrides', ...paramsToSet)
            })
        }

        if (params.paramsSource === ParamsSource.SpecifyAndSave) {
            deployFlags.push('--save-params')
        }

        try {
            const { path: samCliPath } = await getSamCliPathAndVersion()

            // Create a child process to run the SAM build command
            const buildProcess = new ChildProcess(samCliPath, ['build', ...buildFlags], {
                spawnOptions: await addTelemetryEnvVar({
                    cwd: params.projectRoot.fsPath,
                    env: await injectCredentials(connection),
                }),
            })
            // Create a child process to run the SAM deploy command
            const deployProcess = new ChildProcess(samCliPath, ['deploy', ...deployFlags], {
                spawnOptions: await addTelemetryEnvVar({
                    cwd: params.projectRoot.fsPath,
                    env: await injectCredentials(connection),
                }),
            })

            try {
                //Run SAM build in Terminal
                await runInTerminal(buildProcess, 'build')
            } catch (error) {
                throw ToolkitError.chain(error, 'Failed to build SAM template', { details: { ...buildFlags } })
            }

            const { paramsSource, stackName, region, projectRoot } = params
            if (paramsSource !== ParamsSource.SamConfig && !!stackName && !!region) {
                await SamConfig.writeGlobal(projectRoot, stackName, region)
            }
            //Run SAM deploy in Terminal
            await runInTerminal(deployProcess, 'deploy')
        } catch (error) {
            throw ToolkitError.chain(error, 'Failed to deploy SAM template', { details: { ...deployFlags } })
        }
        return {
            isSuccess: true,
        }
    })
}
