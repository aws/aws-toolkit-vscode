/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../treeview/nodes/awsTreeNodeBase'
import { TreeNode, isTreeNode } from '../treeview/resourceTreeDataProvider'
import globals from '../../shared/extensionGlobals'
import { ToolkitError } from '../../shared/errors'
import { DefaultCloudFormationClient } from '../clients/cloudFormationClient'
import { DefaultS3Client } from '../clients/s3Client'
import { samDeployUrl } from '../constants'
import { getSpawnEnv } from '../env/resolveEnv'
import { CloudFormationTemplateRegistry } from '../fs/templateRegistry'
import { telemetry } from '../telemetry/telemetry'
import { createExitPrompter } from '../ui/common/exitPrompter'
import { createRegionPrompter } from '../ui/common/region'
import { ChildProcess } from '../utilities/processUtils'
import { CancellationError } from '../utilities/timeoutUtils'
import { addTelemetryEnvVar } from './cli/samCliInvokerUtils'
import { validateSamDeployConfig, SamConfig, writeSamconfigGlobal } from './config'
import { BucketSource, createBucketSourcePrompter, createBucketNamePrompter } from '../ui/sam/bucketPrompter'
import { createStackPrompter } from '../ui/sam/stackPrompter'
import { TemplateItem, createTemplatePrompter } from '../ui/sam/templatePrompter'
import { createDeployParamsSourcePrompter, ParamsSource } from '../ui/sam/paramsSourcePrompter'
import { getErrorCode, getProjectRoot, getSamCliPathAndVersion, getSource, updateRecentResponse } from './utils'
import { runInTerminal } from './processTerminal'
import {
    TemplateParametersForm,
    TemplateParametersWizard,
} from '../../awsService/appBuilder/wizards/templateParametersWizard'
import { getParameters } from '../../lambda/config/parameterUtils'
import { CompositeWizard } from '../wizards/compositeWizard'

export interface DeployParams {
    readonly paramsSource: ParamsSource
    readonly template: TemplateItem
    readonly templateParameters: any
    readonly region: string
    readonly stackName: string
    readonly bucketSource: BucketSource
    readonly bucketName: string
    readonly projectRoot: vscode.Uri

    [key: string]: any
}

export enum SamDeployEntryPoints {
    SamTemplateFile,
    RegionNodeContextMenu,
    AppBuilderNodeButton,
    CommandPalette,
}

function getDeployEntryPoint(arg: vscode.Uri | AWSTreeNodeBase | TreeNode | undefined) {
    if (arg instanceof vscode.Uri) {
        return SamDeployEntryPoints.SamTemplateFile
    } else if (arg instanceof AWSTreeNodeBase) {
        return SamDeployEntryPoints.RegionNodeContextMenu
    } else if (isTreeNode(arg)) {
        return SamDeployEntryPoints.AppBuilderNodeButton
    } else {
        return SamDeployEntryPoints.CommandPalette
    }
}
const deployMementoRootKey = 'samcli.deploy.params'

type DeployResult = {
    isSuccess: boolean
}

export class DeployWizard extends CompositeWizard<DeployParams> {
    registry: CloudFormationTemplateRegistry
    state: Partial<DeployParams>
    arg: any
    public constructor(
        state: Partial<DeployParams>,
        registry: CloudFormationTemplateRegistry,
        arg?: any,
        shouldPromptExit: boolean = true
    ) {
        super({ initState: state, exitPrompterProvider: shouldPromptExit ? createExitPrompter : undefined })
        this.registry = registry
        this.state = state
        this.arg = arg
    }

    public override async init(): Promise<this> {
        this.form.template.bindPrompter(() => createTemplatePrompter(this.registry, deployMementoRootKey, samDeployUrl))

        this.form.templateParameters.bindPrompter(
            async ({ template }) =>
                this.createWizardPrompter<TemplateParametersWizard, TemplateParametersForm>(
                    TemplateParametersWizard,
                    template!.uri,
                    samDeployUrl,
                    deployMementoRootKey
                ),
            {
                showWhen: async ({ template }) => {
                    const samTemplateParameters = await getParameters(template!.uri)
                    return !!samTemplateParameters && samTemplateParameters.size > 0
                },
            }
        )

        this.form.projectRoot.setDefault(({ template }) => getProjectRoot(template))

        this.form.paramsSource.bindPrompter(async ({ projectRoot }) =>
            createDeployParamsSourcePrompter(await validateSamDeployConfig(projectRoot))
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
            ({ region }) => createBucketNamePrompter(new DefaultS3Client(region!), deployMementoRootKey, samDeployUrl),
            {
                showWhen: ({ bucketSource }) => bucketSource === BucketSource.UserProvided,
            }
        )

        return this
    }
}

export async function getDeployWizard(arg?: any, shouldPromptExit?: boolean): Promise<DeployWizard> {
    let initState: Partial<DeployParams>
    let templateUri: vscode.Uri
    const entryPoint = getDeployEntryPoint(arg)

    switch (entryPoint) {
        case SamDeployEntryPoints.SamTemplateFile:
            initState = { template: { uri: arg as vscode.Uri, data: {} } as TemplateItem }
            break
        case SamDeployEntryPoints.RegionNodeContextMenu:
            initState = { region: arg.regionCode }
            break
        case SamDeployEntryPoints.AppBuilderNodeButton:
            templateUri = arg.getTreeItem().resourceUri as vscode.Uri
            initState = { template: { uri: templateUri, data: {} } as TemplateItem }
            break
        case SamDeployEntryPoints.CommandPalette:
        default:
            initState = {}
            break
    }

    const wizard = new DeployWizard(initState, await globals.templateRegistry, arg, shouldPromptExit)
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

        if (!!params.templateParameters && Object.entries(params.templateParameters).length > 0) {
            const templateParameters = new Map<string, string>(Object.entries(params.templateParameters))
            const paramsToSet: string[] = []
            for (const [key, value] of templateParameters.entries()) {
                if (value) {
                    await updateRecentResponse(deployMementoRootKey, params.template.uri.fsPath, key, value)
                    paramsToSet.push(`ParameterKey=${key},ParameterValue=${value}`)
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
