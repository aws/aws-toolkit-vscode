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
    runInTerminal,
} from '../../shared/sam/sync'
import { DataQuickPickItem, createQuickPick } from '../../shared/ui/pickerPrompter'
import { createCommonButtons } from '../../shared/ui/buttons'
import { samDeployUrl } from '../../shared/constants'
import { Wizard } from '../../shared/wizards/wizard'
import { CloudFormationTemplateRegistry } from '../../shared/fs/templateRegistry'
import { createExitPrompter } from '../../shared/ui/common/exitPrompter'
import { createRegionPrompter } from '../../shared/ui/common/region'
import { DefaultCloudFormationClient } from '../../shared/clients/cloudFormationClient'
import { DefaultS3Client } from '../../shared/clients/s3Client'
import { ToolkitError, globals } from '../../shared'
import { validateSamDeployConfig, writeSamconfigGlobal } from '../../shared/sam/config'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { ChildProcess } from '../../shared/utilities/processUtils'
import { addTelemetryEnvVar } from '../../shared/sam/cli/samCliInvokerUtils'
import { getProjectRoot, getSource } from '../../shared/sam/utils'
import { telemetry } from '../../shared/telemetry'
import { getParameters } from '../config/parameterUtils'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { getSpawnEnv } from '../../shared/env/resolveEnv'
import * as CloudFormation from '../../shared/cloudformation/cloudformation'

export interface DeployParams {
    readonly paramsSource: ParamsSource
    readonly template: TemplateItem
    readonly region: string
    readonly stackName: string
    readonly bucketSource: BucketSource
    readonly bucketName: string
    readonly projectRoot: vscode.Uri

    [key: string]: any
}

function createParamPromptProvider(name: string, defaultValue: string | undefined) {
    return createInputBox({
        title: `Specify SAM parameter value for ${name}`,
        buttons: createCommonButtons(samDeployUrl),
        value: defaultValue,
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
            label: 'Specify required parameters and save as defaults',
            data: ParamsSource.SpecifyAndSave,
        },
        {
            label: 'Specify required parameters',
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

type DeployResult = {
    isSuccess: boolean
}

export enum BucketSource {
    SamCliManaged,
    UserProvided,
}
export enum ParamsSource {
    SpecifyAndSave,
    Specify,
    SamConfig,
}

export class DeployWizard extends Wizard<DeployParams> {
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
        if (this.arg && this.arg.path) {
            // "Deploy" command was invoked on a template.yaml file.
            const templateUri = this.arg as vscode.Uri
            const templateItem = { uri: templateUri, data: {} } as TemplateItem
            const projectRootFolder = getProjectRoot(templateItem)
            const existValidSamConfig: boolean | undefined = await validateSamDeployConfig(projectRootFolder)

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
            this.form.template.bindPrompter(() => createTemplatePrompter(this.registry))
            this.form.projectRoot.setDefault(({ template }) => getProjectRoot(template))
            this.form.paramsSource.bindPrompter(async ({ projectRoot }) => {
                const existValidSamConfig: boolean | undefined = await validateSamDeployConfig(projectRoot)
                return paramsSourcePrompter(existValidSamConfig)
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
            const existValidSamConfig: boolean | undefined = await validateSamDeployConfig(projectRootFolder)

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
            this.form.template.bindPrompter(() => createTemplatePrompter(this.registry))
            this.form.projectRoot.setDefault(({ template }) => getProjectRoot(template))
            this.form.paramsSource.bindPrompter(async ({ projectRoot }) => {
                const existValidSamConfig: boolean | undefined = await validateSamDeployConfig(projectRoot)
                return paramsSourcePrompter(existValidSamConfig)
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
        const template = await CloudFormation.load(templateUri.fsPath)
        const samTemplateParameters = await getParameters(templateUri)
        if (samTemplateParameters.size > 0) {
            const parameterNames = new Set<string>(samTemplateParameters.keys())
            parameterNames.forEach((name) => {
                const defaultValue = template.Parameters ? (template.Parameters[name]?.Default as string) : undefined
                this.form[name].bindPrompter(() => createParamPromptProvider(name, defaultValue))
            })
        }
    }
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

        // Prepare Build params
        const deployParams: Partial<DeployParams> = {}

        const deployEnv = await getSpawnEnv(process.env, { promptForInvalidCredential: true })

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
            deployFlags.push('--region', `${params.region}`)
            deployFlags.push('--stack-name', `${params.stackName}`)
            params.bucketName
                ? deployFlags.push('--s3-bucket', `${params.bucketName}`)
                : deployFlags.push('--resolve-s3')
            deployFlags.push('--capabilities', 'CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM')
        }

        if (params.paramsSource === ParamsSource.SpecifyAndSave) {
            deployFlags.push('--save-params')
        }

        const samTemplateParameters = await getParameters(params.template.uri)
        if (samTemplateParameters.size > 0) {
            const parameterNames = new Set<string>(samTemplateParameters.keys())

            const paramsToSet: string[] = []
            parameterNames.forEach((name) => {
                if (params[name]) {
                    paramsToSet.push(`ParameterKey=${name},ParameterValue=${params[name]}`)
                }
                deployFlags.push('--parameter-overrides', ...paramsToSet)
            })
        }

        try {
            const { path: samCliPath } = await getSamCliPathAndVersion()

            // Create a child process to run the SAM build command
            const buildProcess = new ChildProcess(samCliPath, ['build', ...buildFlags], {
                spawnOptions: await addTelemetryEnvVar({
                    cwd: params.projectRoot.fsPath,
                    env: deployEnv,
                }),
            })

            try {
                //Run SAM build in Terminal
                await runInTerminal(buildProcess, 'build')
            } catch (error) {
                throw ToolkitError.chain(error, 'Failed to build SAM template', { details: { ...buildFlags } })
            }

            // Pass built template to deployFlags
            const templatePath = vscode.Uri.joinPath(params.projectRoot, '.aws-sam', 'build', 'template.yaml').fsPath
            deployFlags.push('--template-file', `${templatePath}`)

            // Create a child process to run the SAM deploy command
            const deployProcess = new ChildProcess(samCliPath, ['deploy', ...deployFlags], {
                spawnOptions: await addTelemetryEnvVar({
                    cwd: params.projectRoot.fsPath,
                    env: deployEnv,
                }),
            })

            //Run SAM deploy in Terminal
            const { paramsSource, stackName, region, projectRoot } = params
            const shouldWriteDeploySamconfigGlobal = paramsSource !== ParamsSource.SamConfig && !!stackName && !!region
            try {
                await runInTerminal(deployProcess, 'deploy')
                shouldWriteDeploySamconfigGlobal && (await writeSamconfigGlobal(projectRoot, stackName, region))
            } catch (error: any) {
                if (error.code === 'NoUpdateExitCode') {
                    shouldWriteDeploySamconfigGlobal && (await writeSamconfigGlobal(projectRoot, stackName, region))
                }
                throw error
            }
        } catch (error) {
            throw ToolkitError.chain(error, 'Failed to deploy SAM template', { details: { ...deployFlags } })
        }
        return {
            isSuccess: true,
        }
    })
}
