/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'

import * as vscode from 'vscode'
import * as path from 'path'
import * as localizedText from '../localizedText'
import { DefaultS3Client } from '../clients/s3Client'
import { DataQuickPickItem, createMultiPick, createQuickPick } from '../ui/pickerPrompter'
import { DefaultCloudFormationClient } from '../clients/cloudFormationClient'
import * as CloudFormation from '../cloudformation/cloudformation'
import { DefaultEcrClient } from '../clients/ecrClient'
import { createRegionPrompter } from '../ui/common/region'
import { CancellationError } from '../utilities/timeoutUtils'
import { ChildProcess } from '../utilities/processUtils'
import { keys, selectFrom } from '../utilities/tsUtils'
import { AWSTreeNodeBase } from '../treeview/nodes/awsTreeNodeBase'
import { ToolkitError } from '../errors'
import { telemetry } from '../telemetry/telemetry'
import { createCommonButtons } from '../ui/buttons'
import { ToolkitPromptSettings } from '../settings'
import { getLogger } from '../logger/logger'
import { createExitPrompter } from '../ui/common/exitPrompter'
import { getConfigFileUri, SamConfig, validateSamSyncConfig, writeSamconfigGlobal } from './config'
import { cast, Optional } from '../utilities/typeConstructors'
import { pushIf, toRecord } from '../utilities/collectionUtils'
import { getParameters } from '../../lambda/config/parameterUtils'
import { addTelemetryEnvVar } from './cli/samCliInvokerUtils'
import { samSyncParamUrl, samSyncUrl, samUpgradeUrl } from '../constants'
import { openUrl } from '../utilities/vsCodeUtils'
import { showOnce } from '../utilities/messages'
import { IamConnection } from '../../auth/connection'
import { CloudFormationTemplateRegistry } from '../fs/templateRegistry'
import { isTreeNode, TreeNode } from '../treeview/resourceTreeDataProvider'
import { getSpawnEnv } from '../env/resolveEnv'
import {
    getProjectRoot,
    getProjectRootUri,
    getRecentResponse,
    getSamCliPathAndVersion,
    getSource,
    getErrorCode,
    updateRecentResponse,
} from './utils'
import { TemplateItem, createTemplatePrompter } from '../ui/sam/templatePrompter'
import { createStackPrompter } from '../ui/sam/stackPrompter'
import { ParamsSource, createSyncParamsSourcePrompter } from '../ui/sam/paramsSourcePrompter'
import { createEcrPrompter } from '../ui/sam/ecrPrompter'
import { BucketSource, createBucketNamePrompter, createBucketSourcePrompter } from '../ui/sam/bucketPrompter'
import { runInTerminal } from './processTerminal'
import {
    TemplateParametersForm,
    TemplateParametersWizard,
} from '../../awsService/appBuilder/wizards/templateParametersWizard'
import { CompositeWizard } from '../wizards/compositeWizard'

export interface SyncParams {
    readonly paramsSource: ParamsSource
    readonly region: string
    readonly deployType: 'infra' | 'code'
    readonly projectRoot: vscode.Uri
    readonly template: TemplateItem
    readonly templateParameters: any
    readonly stackName: string
    readonly bucketSource: BucketSource
    readonly bucketName: string
    readonly ecrRepoUri?: string
    readonly connection: IamConnection
    readonly skipDependencyLayer?: boolean
    readonly syncFlags?: string
}

export const syncMementoRootKey = 'samcli.sync.params'

// TODO: hook this up so it prompts the user when more than 1 environment is present in `samconfig.toml`
export function createEnvironmentPrompter(config: SamConfig, environments = config.listEnvironments()) {
    const recentEnvironmentName = getRecentResponse(syncMementoRootKey, config.location.fsPath, 'environmentName')
    const items = environments.map((env) => ({
        label: env.name,
        data: env,
        recentlyUsed: env.name === recentEnvironmentName,
    }))

    return createQuickPick(items, {
        title: 'Select an Environment to Use',
        placeholder: 'Select an environment',
        buttons: createCommonButtons(samSyncUrl),
    })
}

function hasImageBasedResources(template: CloudFormation.Template) {
    const resources = template.Resources

    return resources === undefined
        ? false
        : Object.keys(resources)
              .filter((key) => resources[key]?.Type === 'AWS::Serverless::Function')
              .map((key) => resources[key]?.Properties?.PackageType)
              .includes('Image')
}

export const syncFlagItems: DataQuickPickItem<string>[] = [
    {
        label: 'Build in source',
        data: '--build-in-source',
        description: 'Opts in to build project in the source folder. Only for node apps',
    },
    {
        label: 'Code',
        data: '--code',
        description: 'Sync only code resources (Lambda Functions, API Gateway, Step Functions)',
    },
    {
        label: 'Dependency layer',
        data: '--dependency-layer',
        description: 'Separate dependencies of individual function into Lambda layers',
    },
    {
        label: 'Skip deploy sync',
        data: '--skip-deploy-sync',
        description: "This will skip the initial infrastructure deployment if it's not required",
    },
    {
        label: 'Use container',
        data: '--use-container',
        description: 'Build functions with an AWS Lambda-like container',
    },
    {
        label: 'Watch',
        data: '--watch',
        description: 'Watch local files and automatically sync with cloud',
        picked: true,
    },
    {
        label: 'Save parameters',
        data: '--save-params',
        description: 'Save to samconfig.toml as default parameters',
        picked: true,
    },
    {
        label: 'Beta features',
        data: '--beta-features',
        description: 'Enable beta features',
    },
    {
        label: 'Debug',
        data: '--debug',
        description: 'Turn on debug logging to print debug messages and display timestamps',
    },
]

export enum SamSyncEntryPoints {
    SamTemplateFile,
    SamConfigFile,
    RegionNodeContextMenu,
    AppBuilderNodeButton,
    CommandPalette,
}

function getSyncEntryPoint(arg: vscode.Uri | AWSTreeNodeBase | TreeNode | undefined) {
    if (arg instanceof vscode.Uri) {
        if (arg.path.endsWith('samconfig.toml')) {
            return SamSyncEntryPoints.SamConfigFile
        }
        return SamSyncEntryPoints.SamTemplateFile
    } else if (arg instanceof AWSTreeNodeBase) {
        return SamSyncEntryPoints.RegionNodeContextMenu
    } else if (isTreeNode(arg)) {
        return SamSyncEntryPoints.AppBuilderNodeButton
    } else {
        return SamSyncEntryPoints.CommandPalette
    }
}

export class SyncWizard extends CompositeWizard<SyncParams> {
    registry: CloudFormationTemplateRegistry
    public constructor(
        state: Pick<SyncParams, 'deployType'> & Partial<SyncParams>,
        registry: CloudFormationTemplateRegistry,
        shouldPromptExit: boolean = true
    ) {
        super({ initState: state, exitPrompterProvider: shouldPromptExit ? createExitPrompter : undefined })
        this.registry = registry
    }

    public override async init(): Promise<this> {
        this.form.template.bindPrompter(() => createTemplatePrompter(this.registry, syncMementoRootKey, samSyncUrl))
        this.form.templateParameters.bindPrompter(
            async ({ template }) =>
                this.createWizardPrompter<TemplateParametersWizard, TemplateParametersForm>(
                    TemplateParametersWizard,
                    template!.uri,
                    samSyncUrl,
                    syncMementoRootKey
                ),
            {
                showWhen: async ({ template }) => {
                    const samTemplateParameters = await getParameters(template!.uri)
                    return !!samTemplateParameters && samTemplateParameters.size > 0
                },
            }
        )

        this.form.projectRoot.setDefault(({ template }) => getProjectRoot(template))

        this.form.paramsSource.bindPrompter(async ({ projectRoot }) => {
            const existValidSamConfig: boolean | undefined = await validateSamSyncConfig(projectRoot)
            return createSyncParamsSourcePrompter(existValidSamConfig)
        })

        this.form.region.bindPrompter(() => createRegionPrompter().transform((r) => r.id), {
            showWhen: ({ paramsSource }) =>
                paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
        })

        this.form.stackName.bindPrompter(
            ({ region }) =>
                createStackPrompter(new DefaultCloudFormationClient(region!), syncMementoRootKey, samSyncUrl),
            {
                showWhen: ({ paramsSource }) =>
                    paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
            }
        )
        this.form.bucketSource.bindPrompter(() => createBucketSourcePrompter(samSyncUrl), {
            showWhen: ({ paramsSource }) =>
                paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
        })

        this.form.bucketName.bindPrompter(
            ({ region }) => createBucketNamePrompter(new DefaultS3Client(region!), syncMementoRootKey, samSyncUrl),
            {
                showWhen: ({ bucketSource }) => bucketSource === BucketSource.UserProvided,
            }
        )

        this.form.ecrRepoUri.bindPrompter(
            ({ region }) => createEcrPrompter(new DefaultEcrClient(region!), syncMementoRootKey),
            {
                showWhen: ({ template, paramsSource }) =>
                    !!template &&
                    hasImageBasedResources(template.data) &&
                    (paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave),
            }
        )

        // todo wrap with localize
        this.form.syncFlags.bindPrompter(
            () =>
                createMultiPick(syncFlagItems, {
                    title: 'Specify parameters for sync',
                    placeholder: 'Press enter to proceed with highlighted option',
                    buttons: createCommonButtons(samSyncParamUrl),
                }),
            {
                showWhen: ({ paramsSource }) =>
                    paramsSource === ParamsSource.Specify || paramsSource === ParamsSource.SpecifyAndSave,
            }
        )
        return this
    }
}

type BindableData = Record<string, string | boolean | undefined>
export function bindDataToParams<T extends BindableData>(data: T, bindings: { [P in keyof T]-?: string }): string[] {
    const params = [] as string[]

    for (const [k, v] of Object.entries(data)) {
        if (v === true) {
            params.push(bindings[k])
        } else if (typeof v === 'string') {
            params.push(bindings[k], v)
        }
    }

    return params
}

export async function ensureBucket(resp: Pick<SyncParams, 'region' | 'bucketName'>) {
    const newBucketName = resp.bucketName.match(/^newbucket:(.*)/)?.[1]
    if (newBucketName === undefined) {
        return resp.bucketName
    }

    try {
        await new DefaultS3Client(resp.region).createBucket({ bucketName: newBucketName })

        return newBucketName
    } catch (err) {
        throw ToolkitError.chain(err, `Failed to create new bucket "${newBucketName}"`)
    }
}

export async function ensureRepo(resp: Pick<SyncParams, 'region' | 'ecrRepoUri'>) {
    const newRepoName = resp.ecrRepoUri?.match(/^newrepo:(.*)/)?.[1]
    if (newRepoName === undefined) {
        return resp.ecrRepoUri
    }

    try {
        const repo = await new DefaultEcrClient(resp.region).createRepository(newRepoName)

        return repo.repository?.repositoryUri
    } catch (err) {
        throw ToolkitError.chain(err, `Failed to create new ECR repository "${newRepoName}"`)
    }
}

export async function saveAndBindArgs(args: SyncParams): Promise<{ readonly boundArgs: string[] }> {
    const data = {
        codeOnly: args.deployType === 'code',
        templatePath: args.template?.uri?.fsPath,
        bucketName: args.bucketName && (await ensureBucket(args)),
        ecrRepoUri: args.ecrRepoUri && (await ensureRepo(args)),
        ...selectFrom(args, 'stackName', 'region', 'skipDependencyLayer'),
    }

    await Promise.all([
        updateSyncRecentResponse(args.region, 'stackName', data.stackName),
        updateSyncRecentResponse(args.region, 'bucketName', data.bucketName),
        updateSyncRecentResponse(args.region, 'ecrRepoUri', data.ecrRepoUri),
        updateSyncRecentResponse('global', 'templatePath', data.templatePath),
    ])

    const boundArgs = bindDataToParams(data, {
        region: '--region',
        codeOnly: '--code',
        templatePath: '--template',
        stackName: '--stack-name',
        bucketName: '--s3-bucket',
        ecrRepoUri: '--image-repository',
        skipDependencyLayer: '--no-dependency-layer',
    })

    if (args.paramsSource === ParamsSource.SamConfig) {
        const samConfigFile = await getConfigFileUri(args.projectRoot)
        boundArgs.push('--config-file', `${samConfigFile.fsPath}`)
    }

    if (args.paramsSource === ParamsSource.SpecifyAndSave) {
        boundArgs.push('--save-params')
    }

    return { boundArgs }
}

export async function runSamSync(args: SyncParams) {
    telemetry.record({ lambdaPackageType: args.ecrRepoUri !== undefined ? 'Image' : 'Zip' })

    const { path: samCliPath, parsedVersion } = await getSamCliPathAndVersion()
    const { boundArgs } = await saveAndBindArgs(args)

    if (!!args.templateParameters && Object.entries(args.templateParameters).length > 0) {
        const templateParameters = new Map<string, string>(Object.entries(args.templateParameters))
        const paramsToSet: string[] = []
        for (const [key, value] of templateParameters.entries()) {
            if (value) {
                await updateRecentResponse(syncMementoRootKey, args.template.uri.fsPath, key, value)
                paramsToSet.push(`ParameterKey=${key},ParameterValue=${value}`)
            }
        }
        paramsToSet.length > 0 && boundArgs.push('--parameter-overrides', paramsToSet.join(' '))
    }

    // '--no-watch' was not added until https://github.com/aws/aws-sam-cli/releases/tag/v1.77.0
    // Forcing every user to upgrade will be a headache for what is otherwise a minor problem
    if ((parsedVersion?.compare('1.77.0') ?? -1) >= 0) {
        boundArgs.push('--no-watch')
    }

    if ((parsedVersion?.compare('1.98.0') ?? 1) < 0) {
        await showOnce('sam.sync.updateMessage', async () => {
            const message = `Your current version of SAM CLI (${parsedVersion?.version}) does not include the latest improvements for "sam sync". Some parameters may not be available. Update to the latest version to get all new parameters/options.`
            const learnMoreUrl = vscode.Uri.parse(
                'https://aws.amazon.com/about-aws/whats-new/2023/03/aws-toolkits-jetbrains-vs-code-sam-accelerate/'
            )
            const openDocsItem = 'Open Upgrade Documentation'
            const resp = await vscode.window.showInformationMessage(message, localizedText.learnMore, openDocsItem)
            if (resp === openDocsItem) {
                await openUrl(samUpgradeUrl)
            } else if (resp === localizedText.learnMore) {
                await openUrl(learnMoreUrl)
            }
        })
    }

    const syncFlags: string[] = args.syncFlags ? JSON.parse(args.syncFlags) : []
    boundArgs.push(...syncFlags)

    const sam = new ChildProcess(samCliPath, ['sync', ...resolveSyncArgConflict(boundArgs)], {
        spawnOptions: await addTelemetryEnvVar({
            cwd: args.projectRoot.fsPath,
            env: await getSpawnEnv(process.env, { promptForInvalidCredential: true }),
        }),
    })

    // with '--watch' selected, the sync process will run in the background until the user manually kills it
    // we need to save the stack and region to the samconfig file now, otherwise the user would not see latest deployed resoure during this sync process
    const { paramsSource, stackName, region, projectRoot } = args
    const shouldWriteSyncSamconfigGlobal = paramsSource !== ParamsSource.SamConfig && !!stackName && !!region
    if (boundArgs.includes('--watch')) {
        shouldWriteSyncSamconfigGlobal && (await writeSamconfigGlobal(projectRoot, stackName, region))
    }

    await runInTerminal(sam, 'sync')
    shouldWriteSyncSamconfigGlobal && (await writeSamconfigGlobal(projectRoot, stackName, region))
}

export async function getSyncWizard(
    deployType: SyncParams['deployType'],
    arg: any,
    validate?: boolean,
    shouldPromptExit?: boolean
): Promise<SyncWizard> {
    const registry = await globals.templateRegistry
    const wizard = new SyncWizard(
        { deployType, ...(await prepareSyncParams(arg, validate)) },
        registry,
        shouldPromptExit
    )
    return wizard
}

const getStringParam = (config: SamConfig, key: string) => {
    try {
        return cast(config.getCommandParam('sync', key), Optional(String))
    } catch (err) {
        throw ToolkitError.chain(err, `Unable to read "${key}" in config file`, {
            details: { location: config.location.path },
        })
    }
}

const configKeyMapping: Record<string, string | string[]> = {
    region: 'region',
    stackName: 'stack_name',
    bucketName: 's3_bucket',
    ecrRepoUri: 'image_repository',
    templatePath: ['template', 'template_file'],
}

export function getSyncParamsFromConfig(config: SamConfig) {
    const samConfigParams: string[] = []
    const params = toRecord(keys(configKeyMapping), (k) => {
        const key = configKeyMapping[k]
        if (typeof key === 'string') {
            const param = getStringParam(config, key)
            pushIf(samConfigParams, param !== undefined, key)

            return param
        } else {
            for (const alt of key) {
                const param = getStringParam(config, alt)
                if (param !== undefined) {
                    samConfigParams.push(alt)

                    return param
                }
            }
        }
    })

    telemetry.record({ samConfigParams: samConfigParams.join(',') } as any)

    return params
}

export async function prepareSyncParams(
    arg: vscode.Uri | AWSTreeNodeBase | TreeNode | undefined,
    validate?: boolean
): Promise<Partial<SyncParams>> {
    // Skip creating dependency layers by default for backwards compat
    const baseParams: Partial<SyncParams> = { skipDependencyLayer: true }
    const entryPoint = getSyncEntryPoint(arg)

    switch (entryPoint) {
        case SamSyncEntryPoints.SamTemplateFile: {
            const entryPointArg = arg as vscode.Uri
            const template = {
                uri: entryPointArg,
                data: await CloudFormation.load(entryPointArg.fsPath, validate),
            }

            return {
                ...baseParams,
                template: template,
                projectRoot: getProjectRootUri(template.uri),
            }
        }
        case SamSyncEntryPoints.SamConfigFile: {
            const config = await SamConfig.fromConfigFileUri(arg as vscode.Uri)
            const params = getSyncParamsFromConfig(config)
            const projectRoot = vscode.Uri.joinPath(config.location, '..')
            const templateUri = params.templatePath
                ? vscode.Uri.file(path.resolve(projectRoot.fsPath, params.templatePath))
                : undefined
            const samConfigFileTemplate = templateUri
                ? {
                      uri: templateUri,
                      data: await CloudFormation.load(templateUri.fsPath),
                  }
                : undefined
            // Always use the dependency layer if the user specified to do so
            const skipDependencyLayer = !config.getCommandParam('sync', 'dependency_layer')

            return {
                ...baseParams,
                ...params,
                template: samConfigFileTemplate,
                projectRoot,
                skipDependencyLayer,
            } as SyncParams
        }
        case SamSyncEntryPoints.RegionNodeContextMenu: {
            const entryPointArg = arg as AWSTreeNodeBase
            return { ...baseParams, region: entryPointArg.regionCode }
        }
        case SamSyncEntryPoints.AppBuilderNodeButton: {
            const entryPointArg = arg as TreeNode
            const templateUri = (entryPointArg.getTreeItem() as vscode.TreeItem).resourceUri
            if (templateUri) {
                const template = {
                    uri: templateUri,
                    data: await CloudFormation.load(templateUri.fsPath, validate),
                }
                return {
                    ...baseParams,
                    template,
                    projectRoot: getProjectRootUri(templateUri),
                }
            }
            return baseParams
        }
        case SamSyncEntryPoints.CommandPalette:
        default:
            return baseParams
    }
}

export type SamSyncResult = {
    isSuccess: boolean
}

export async function runSync(
    deployType: SyncParams['deployType'],
    arg: vscode.Uri | AWSTreeNodeBase | TreeNode | undefined,
    validate?: boolean,
    syncParam?: SyncParams
): Promise<SamSyncResult> {
    return await telemetry.sam_sync.run(async () => {
        const source = getSource(arg)
        telemetry.record({ syncedResources: deployType === 'infra' ? 'AllResources' : 'CodeOnly', source: source })

        await confirmDevStack()
        const params = syncParam ?? (await (await getSyncWizard(deployType, arg, validate)).run())
        getLogger().info('%O', params)

        if (params === undefined) {
            throw new CancellationError('user')
        }

        try {
            await runSamSync({ ...params })
            return {
                isSuccess: true,
            }
        } catch (err) {
            throw ToolkitError.chain(err, 'Failed to sync SAM application', {
                details: { ...params },
                code: getErrorCode(err),
            })
        }
    })
}

async function updateSyncRecentResponse(region: string, key: string, value: string | undefined) {
    return await updateRecentResponse(syncMementoRootKey, region, key, value)
}

export async function confirmDevStack() {
    const canPrompt = ToolkitPromptSettings.instance.isPromptEnabled('samcliConfirmDevStack')
    if (!canPrompt) {
        return
    }

    const message = `
The SAM CLI will use the AWS Lambda, Amazon API Gateway, and AWS StepFunctions APIs to upload your code without
performing a CloudFormation deployment. This will cause drift in your CloudFormation stack.
**The sync command should only be used against a development stack**.

Confirm that you are synchronizing a development stack.
`.trim()

    const okDontShow = "OK, and don't show this again"
    const resp = await vscode.window.showInformationMessage(message, { modal: true }, localizedText.ok, okDontShow)
    if (resp !== localizedText.ok && resp !== okDontShow) {
        throw new CancellationError('user')
    }

    if (resp === okDontShow) {
        await ToolkitPromptSettings.instance.disablePrompt('samcliConfirmDevStack')
    }
}

function resolveSyncArgConflict(boundArgs: string[]): string[] {
    const boundArgsSet = new Set(boundArgs)
    if (boundArgsSet.has('--watch')) {
        boundArgsSet.delete('--no-watch')
    }
    if (boundArgsSet.has('--dependency-layer')) {
        boundArgsSet.delete('--no--dependency-layer')
    }
    if (boundArgsSet.has('--build-in-source')) {
        boundArgsSet.delete('--no-build-in-source')
    }
    if (boundArgsSet.has('--use-container') || boundArgsSet.has('-u')) {
        boundArgsSet.delete('--build-in-source')
    }

    // TODO phase 2: add anti param
    // // apply anti param if param is not set
    // if (!boundArgsSet.has('--cached')) {
    //     boundArgsSet.add('--no-cached')
    // }
    // if (!boundArgsSet.has('--build-in-source')) {
    //     boundArgsSet.add('--no-build-in-source')
    // }
    // if (!boundArgsSet.has('--dependency-layer')) {
    //     boundArgsSet.add('--no-dependency-layer')
    // }
    // if (!boundArgsSet.has('--skip-deploy-sync')) {
    //     boundArgsSet.add('--no-skip-deploy-sync')
    // }

    return Array.from(boundArgsSet)
}
