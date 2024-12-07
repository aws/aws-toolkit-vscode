/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ToolkitError, globals } from '../../shared'
import * as CloudFormation from '../../shared/cloudformation/cloudformation'
import { getParameters } from '../../lambda/config/parameterUtils'
import { DefaultCloudFormationClient } from '../clients/cloudFormationClient'
import { DefaultS3Client } from '../clients/s3Client'
import { samDeployUrl } from '../constants'
import { getSpawnEnv } from '../env/resolveEnv'
import { CloudFormationTemplateRegistry } from '../fs/templateRegistry'
import { telemetry } from '../telemetry'
import { createCommonButtons } from '../ui/buttons'
import { createExitPrompter } from '../ui/common/exitPrompter'
import { createRegionPrompter } from '../ui/common/region'
import { createInputBox } from '../ui/inputPrompter'
import { ChildProcess } from '../utilities/processUtils'
import { CancellationError } from '../utilities/timeoutUtils'
import { Wizard } from '../wizards/wizard'
import { addTelemetryEnvVar } from './cli/samCliInvokerUtils'
import { validateSamDeployConfig, SamConfig, writeSamconfigGlobal } from './config'
import { BucketSource, createBucketSourcePrompter, createBucketNamePrompter } from '../ui/sam/bucketPrompter'
import { createStackPrompter } from '../ui/sam/stackPrompter'
import { TemplateItem, createTemplatePrompter } from '../ui/sam/templatePrompter'
import { createDeployParamsSourcePrompter, ParamsSource } from '../ui/sam/paramsSourcePrompter'
import {
    getErrorCode,
    getProjectRoot,
    getSamCliPathAndVersion,
    getSource,
    getRecentResponse,
    updateRecentResponse,
} from './utils'
import { runInTerminal } from './processTerminal'

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

const deployMementoRootKey = 'samcli.deploy.params'

function getRecentDeployParams(identifier: string, key: string): string | undefined {
    return getRecentResponse(deployMementoRootKey, identifier, key)
}

function createParamPromptProvider(name: string, defaultValue: string | undefined, templateFsPath: string = 'default') {
    return createInputBox({
        title: `Specify SAM parameter value for ${name}`,
        buttons: createCommonButtons(samDeployUrl),
        value: getRecentDeployParams(templateFsPath, name) ?? defaultValue,
    })
}

type DeployResult = {
    isSuccess: boolean
}

export class DeployWizard extends Wizard<DeployParams> {
    registry: CloudFormationTemplateRegistry
    state: Partial<DeployParams>
    arg: any
    samTemplateParameters: Map<string, { required: boolean }> | undefined
    preloadedTemplate: CloudFormation.Template | undefined
    public constructor(
        state: Partial<DeployParams>,
        registry: CloudFormationTemplateRegistry,
        arg?: any,
        samTemplateParameters?: Map<string, { required: boolean }>,
        preloadedTemplate?: CloudFormation.Template,
        shouldPromptExit: boolean = true
    ) {
        super({ initState: state, exitPrompterProvider: shouldPromptExit ? createExitPrompter : undefined })
        this.registry = registry
        this.state = state
        this.arg = arg
        this.samTemplateParameters = samTemplateParameters
        this.preloadedTemplate = preloadedTemplate
        if (this.arg && this.arg.path) {
            // "Deploy" command was invoked on a template.yaml file.
            const templateUri = this.arg as vscode.Uri
            const templateItem = { uri: templateUri, data: {} } as TemplateItem
            const projectRootFolder = getProjectRoot(templateItem)

            this.addParameterPromptersIfApplicable(templateUri)

            this.form.template.setDefault(templateItem)
            this.form.projectRoot.setDefault(() => projectRootFolder)
            this.form.paramsSource.bindPrompter(async () =>
                createDeployParamsSourcePrompter(await validateSamDeployConfig(projectRootFolder))
            )

            this.form.region.bindPrompter(() => createRegionPrompter().transform((r) => r.id), {
                showWhen: ({ paramsSource }) =>
                    paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
            })
            this.form.stackName.bindPrompter(
                ({ region }) =>
                    createStackPrompter(new DefaultCloudFormationClient(region!), deployMementoRootKey, samDeployUrl),
                {
                    showWhen: ({ paramsSource }) =>
                        paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
                }
            )
            this.form.bucketSource.bindPrompter(() => createBucketSourcePrompter(samDeployUrl), {
                showWhen: ({ paramsSource }) =>
                    paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
            })
            this.form.bucketName.bindPrompter(
                ({ region }) =>
                    createBucketNamePrompter(new DefaultS3Client(region!), deployMementoRootKey, samDeployUrl),
                {
                    showWhen: ({ bucketSource }) => bucketSource === BucketSource.UserProvided,
                }
            )
        } else if (this.arg && this.arg.regionCode) {
            // "Deploy" command was invoked on a regionNode.
            this.form.template.bindPrompter(() =>
                createTemplatePrompter(this.registry, deployMementoRootKey, samDeployUrl)
            )
            this.form.projectRoot.setDefault(({ template }) => getProjectRoot(template))
            this.form.paramsSource.bindPrompter(async ({ projectRoot }) => {
                const existValidSamConfig: boolean | undefined = await validateSamDeployConfig(projectRoot)
                return createDeployParamsSourcePrompter(existValidSamConfig)
            })
            this.form.region.setDefault(() => this.arg.regionCode)
            this.form.stackName.bindPrompter(
                ({ region }) =>
                    createStackPrompter(new DefaultCloudFormationClient(region!), deployMementoRootKey, samDeployUrl),
                {
                    showWhen: ({ paramsSource }) =>
                        paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
                }
            )
            this.form.bucketSource.bindPrompter(() => createBucketSourcePrompter(samDeployUrl), {
                showWhen: ({ paramsSource }) =>
                    paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
            })
            this.form.bucketName.bindPrompter(
                ({ region }) =>
                    createBucketNamePrompter(new DefaultS3Client(region!), deployMementoRootKey, samDeployUrl),
                {
                    showWhen: ({ bucketSource }) => bucketSource === BucketSource.UserProvided,
                }
            )
        } else if (this.arg && this.arg.getTreeItem().resourceUri) {
            // "Deploy" command was invoked on a TreeNode on the AppBuilder.
            const templateUri = this.arg.getTreeItem().resourceUri as vscode.Uri
            const templateItem = { uri: templateUri, data: {} } as TemplateItem
            const projectRootFolder = getProjectRoot(templateItem)

            this.addParameterPromptersIfApplicable(templateUri)
            this.form.template.setDefault(templateItem)
            this.form.paramsSource.bindPrompter(async () =>
                createDeployParamsSourcePrompter(await validateSamDeployConfig(projectRootFolder))
            )

            this.form.region.bindPrompter(() => createRegionPrompter().transform((r) => r.id), {
                showWhen: ({ paramsSource }) =>
                    paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
            })
            this.form.stackName.bindPrompter(
                ({ region }) =>
                    createStackPrompter(new DefaultCloudFormationClient(region!), deployMementoRootKey, samDeployUrl),
                {
                    showWhen: ({ paramsSource }) =>
                        paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
                }
            )
            this.form.bucketSource.bindPrompter(() => createBucketSourcePrompter(samDeployUrl), {
                showWhen: ({ paramsSource }) =>
                    paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
            })
            this.form.bucketName.bindPrompter(
                ({ region }) =>
                    createBucketNamePrompter(new DefaultS3Client(region!), deployMementoRootKey, samDeployUrl),
                {
                    showWhen: ({ bucketSource }) => bucketSource === BucketSource.UserProvided,
                }
            )
            this.form.projectRoot.setDefault(() => getProjectRoot(templateItem))
        } else {
            // "Deploy" command was invoked on the command palette.
            this.form.template.bindPrompter(() =>
                createTemplatePrompter(this.registry, deployMementoRootKey, samDeployUrl)
            )
            this.form.projectRoot.setDefault(({ template }) => getProjectRoot(template))
            this.form.paramsSource.bindPrompter(async ({ projectRoot }) => {
                const existValidSamConfig: boolean | undefined = await validateSamDeployConfig(projectRoot)
                return createDeployParamsSourcePrompter(existValidSamConfig)
            })
            this.form.region.bindPrompter(() => createRegionPrompter().transform((r) => r.id), {
                showWhen: ({ paramsSource }) =>
                    paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
            })
            this.form.stackName.bindPrompter(
                ({ region }) =>
                    createStackPrompter(new DefaultCloudFormationClient(region!), deployMementoRootKey, samDeployUrl),
                {
                    showWhen: ({ paramsSource }) =>
                        paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
                }
            )
            this.form.bucketSource.bindPrompter(() => createBucketSourcePrompter(samDeployUrl), {
                showWhen: ({ paramsSource }) =>
                    paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
            })
            this.form.bucketName.bindPrompter(
                ({ region }) =>
                    createBucketNamePrompter(new DefaultS3Client(region!), deployMementoRootKey, samDeployUrl),
                {
                    showWhen: ({ bucketSource }) => bucketSource === BucketSource.UserProvided,
                }
            )
        }

        return this
    }

    /**
     * Parse the template for parameters and add prompters for them if applicable.
     * @param templateUri the uri of the template
     */
    addParameterPromptersIfApplicable(templateUri: vscode.Uri) {
        if (!this.samTemplateParameters || this.samTemplateParameters.size === 0) {
            return
        }
        const parameterNames = new Set<string>(this.samTemplateParameters.keys())
        parameterNames.forEach((name) => {
            if (this.preloadedTemplate) {
                const defaultValue = this.preloadedTemplate.Parameters
                    ? (this.preloadedTemplate.Parameters[name]?.Default as string)
                    : undefined
                this.form[name].bindPrompter(() => createParamPromptProvider(name, defaultValue, templateUri.fsPath))
            }
        })
    }
}

export async function getDeployWizard(arg?: any, shouldPromptExit?: boolean): Promise<DeployWizard> {
    let samTemplateParameters = new Map<string, { required: boolean }>()
    let preloadedTemplate: CloudFormation.Template | undefined
    if (arg && arg.path) {
        // "Deploy" command was invoked on a template.yaml file.
        const templateUri = arg as vscode.Uri
        samTemplateParameters = await getParameters(templateUri)
        preloadedTemplate = await CloudFormation.load(templateUri.fsPath)
    } else if (arg && arg.regionCode) {
        // region node, do nothing
    } else if (arg && arg.getTreeItem().resourceUri) {
        const templateUri = arg.getTreeItem().resourceUri as vscode.Uri
        samTemplateParameters = await getParameters(templateUri)
        preloadedTemplate = await CloudFormation.load(templateUri.fsPath)
    }

    const deployParams: Partial<DeployParams> = {}
    const wizard = new DeployWizard(
        deployParams,
        await globals.templateRegistry,
        arg,
        samTemplateParameters,
        preloadedTemplate,
        shouldPromptExit
    )
    return wizard
}

export async function runDeploy(arg: any, wizardParams?: DeployParams): Promise<DeployResult> {
    return await telemetry.sam_deploy.run(async () => {
        const source = getSource(arg)
        telemetry.record({ source: source })
        const deployEnv = await getSpawnEnv(process.env, { promptForInvalidCredential: true })
        const params = wizardParams ?? (await (await getDeployWizard(arg)).run())
        if (params === undefined) {
            throw new CancellationError('user')
        }

        const deployFlags: string[] = ['--no-confirm-changeset']
        const buildFlags: string[] = ['--cached']

        if (params.paramsSource === ParamsSource.SamConfig) {
            const samconfig = await SamConfig.fromProjectRoot(params.projectRoot)
            const samconfigRegionInfo = `${await samconfig.getCommandParam('global', 'region')}`

            // When entry point is RegionNode, the params.region should take precedence
            deployFlags.push('--region', `${params.region || samconfigRegionInfo}`)
            deployFlags.push('--config-file', `${samconfig.location.fsPath}`)
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
            for (const name of parameterNames) {
                if (params[name]) {
                    await updateRecentResponse(deployMementoRootKey, params.template.uri.fsPath, name, params[name])
                    paramsToSet.push(`ParameterKey=${name},ParameterValue=${params[name]}`)
                }
            }
            paramsToSet.length > 0 && deployFlags.push('--parameter-overrides', paramsToSet.join(' '))
        }

        await updateRecentResponse(deployMementoRootKey, 'global', 'templatePath', params.template.uri.fsPath)

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
                // Run SAM build in Terminal
                await runInTerminal(buildProcess, 'build')
            } catch (error) {
                throw ToolkitError.chain(error, 'Failed to build SAM template', { details: { ...buildFlags } })
            }

            // Create a child process to run the SAM deploy command
            const deployProcess = new ChildProcess(samCliPath, ['deploy', ...deployFlags], {
                spawnOptions: await addTelemetryEnvVar({
                    cwd: params.projectRoot.fsPath,
                    env: deployEnv,
                }),
            })

            // Run SAM deploy in Terminal
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
            throw ToolkitError.chain(error, 'Failed to deploy SAM template', {
                details: { ...deployFlags },
                code: getErrorCode(error),
            })
        }
        return {
            isSuccess: true,
        }
    })
}
