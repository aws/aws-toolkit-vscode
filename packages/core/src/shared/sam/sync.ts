/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'

import * as vscode from 'vscode'
import * as path from 'path'
import * as nls from 'vscode-nls'
import * as localizedText from '../localizedText'
import { DefaultS3Client } from '../clients/s3Client'
import { Wizard } from '../wizards/wizard'
import { DataQuickPickItem, createMultiPick, createQuickPick } from '../ui/pickerPrompter'
import { DefaultCloudFormationClient } from '../clients/cloudFormationClient'
import * as CloudFormation from '../cloudformation/cloudformation'
import { DefaultEcrClient } from '../clients/ecrClient'
import { createRegionPrompter } from '../ui/common/region'
import { CancellationError } from '../utilities/timeoutUtils'
import { ChildProcess, ChildProcessResult } from '../utilities/processUtils'
import { keys, selectFrom } from '../utilities/tsUtils'
import { AWSTreeNodeBase } from '../treeview/nodes/awsTreeNodeBase'
import { ToolkitError, UnknownError } from '../errors'
import { telemetry } from '../telemetry/telemetry'
import { createCommonButtons } from '../ui/buttons'
import { ToolkitPromptSettings } from '../settings'
import { getLogger } from '../logger'
import { getSamInitDocUrl, isCloud9 } from '../extensionUtilities'
import { removeAnsi } from '../utilities/textUtilities'
import { createExitPrompter } from '../ui/common/exitPrompter'
import { StackSummary } from 'aws-sdk/clients/cloudformation'
import { SamCliSettings } from './cli/samCliSettings'
import { getConfigFileUri, SamConfig, validateSamSyncConfig, writeSamconfigGlobal } from './config'
import { cast, Optional } from '../utilities/typeConstructors'
import { pushIf, toRecord } from '../utilities/collectionUtils'
import { SamCliInfoInvocation } from './cli/samCliInfo'
import { parse } from 'semver'
import { isAutomation } from '../vscode/env'
import { getOverriddenParameters } from '../../lambda/config/parameterUtils'
import { addTelemetryEnvVar } from './cli/samCliInvokerUtils'
import { samSyncParamUrl, samSyncUrl, samUpgradeUrl } from '../constants'
import { getAwsConsoleUrl } from '../awsConsole'
import { openUrl } from '../utilities/vsCodeUtils'
import { showOnce } from '../utilities/messages'
import { IamConnection } from '../../auth/connection'
import { CloudFormationTemplateRegistry } from '../fs/templateRegistry'
import { TreeNode } from '../treeview/resourceTreeDataProvider'
import { getSpawnEnv } from '../env/resolveEnv'
import { getProjectRoot, getProjectRootUri, getSource } from './utils'

const localize = nls.loadMessageBundle()

export interface SyncParams {
    readonly paramsSource: ParamsSource
    readonly region: string
    readonly deployType: 'infra' | 'code'
    readonly projectRoot: vscode.Uri
    readonly template: TemplateItem
    readonly stackName: string
    readonly bucketSource: BucketSource
    readonly bucketName: string
    readonly ecrRepoUri?: string
    readonly connection: IamConnection
    readonly skipDependencyLayer?: boolean
    readonly syncFlags?: string
}

export enum ParamsSource {
    SpecifyAndSave,
    SamConfig,
    Flags,
}
enum BucketSource {
    SamCliManaged,
    UserProvided,
}

export function paramsSourcePrompter(existValidSamconfig: boolean | undefined) {
    const items: DataQuickPickItem<ParamsSource>[] = [
        {
            label: 'Specify required parameters and save as defaults',
            data: ParamsSource.SpecifyAndSave,
        },
        {
            label: 'Specify required parameters',
            data: ParamsSource.Flags,
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
        buttons: createCommonButtons(samSyncUrl),
    })
}

export const prefixNewBucketName = (name: string) => `newbucket:${name}`
export const prefixNewRepoName = (name: string) => `newrepo:${name}`

export function createBucketPrompter(client: DefaultS3Client) {
    const recentBucket = getRecentResponse(client.regionCode, 'bucketName')
    const items = client.listBucketsIterable().map((b) => [
        {
            label: b.Name,
            data: b.Name as SyncParams['bucketName'],
            recentlyUsed: b.Name === recentBucket,
        },
    ])

    return createQuickPick(items, {
        title: 'Select an S3 Bucket',
        placeholder: 'Select a bucket (or enter a name to create one)',
        buttons: createCommonButtons(samSyncUrl),
        filterBoxInputSettings: {
            label: 'Create a New Bucket',
            // This is basically a hack. I need to refactor `createQuickPick` a bit.
            transform: (v) => prefixNewBucketName(v),
        },
        noItemsFoundItem: {
            label: localize(
                'aws.cfn.noStacks',
                'No S3 buckets for region "{0}". Enter a name to create a new one.',
                client.regionCode
            ),
            data: undefined,
            onClick: undefined,
        },
    })
}

const canPickStack = (s: StackSummary) => s.StackStatus.endsWith('_COMPLETE')
const canShowStack = (s: StackSummary) =>
    (s.StackStatus.endsWith('_COMPLETE') || s.StackStatus.endsWith('_IN_PROGRESS')) && !s.StackStatus.includes('DELETE')

export function createStackPrompter(client: DefaultCloudFormationClient) {
    const recentStack = getRecentResponse(client.regionCode, 'stackName')
    const consoleUrl = getAwsConsoleUrl('cloudformation', client.regionCode)
    const items = client.listAllStacks().map((stacks) =>
        stacks.filter(canShowStack).map((s) => ({
            label: s.StackName,
            data: s.StackName,
            invalidSelection: !canPickStack(s),
            recentlyUsed: s.StackName === recentStack,
            description: !canPickStack(s) ? 'stack create/update already in progress' : undefined,
        }))
    )

    return createQuickPick(items, {
        title: 'Select a CloudFormation Stack',
        placeholder: 'Select a stack (or enter a name to create one)',
        filterBoxInputSettings: {
            label: 'Create a New Stack',
            transform: (v) => v,
        },
        buttons: createCommonButtons(samSyncUrl, consoleUrl),
        noItemsFoundItem: {
            label: localize(
                'aws.cfn.noStacks',
                'No stacks in region "{0}". Enter a name to create a new one.',
                client.regionCode
            ),
            data: undefined,
            onClick: undefined,
        },
    })
}

export function createEcrPrompter(client: DefaultEcrClient) {
    const recentEcrRepo = getRecentResponse(client.regionCode, 'ecrRepoUri')
    const consoleUrl = getAwsConsoleUrl('ecr', client.regionCode)
    const items = client.listAllRepositories().map((list) =>
        list.map((repo) => ({
            label: repo.repositoryName,
            data: repo.repositoryUri,
            detail: repo.repositoryArn,
            recentlyUsed: repo.repositoryUri === recentEcrRepo,
        }))
    )

    return createQuickPick(items, {
        title: 'Select an ECR Repository',
        placeholder: 'Select a repository (or enter a name to create one)',
        buttons: createCommonButtons(samSyncUrl, consoleUrl),
        filterBoxInputSettings: {
            label: 'Create a New Repository',
            transform: (v) => prefixNewRepoName(v),
        },
        noItemsFoundItem: {
            label: localize(
                'aws.ecr.noRepos',
                'No ECR repositories in region "{0}". Enter a name to create a new one.',
                client.regionCode
            ),
            data: undefined,
            onClick: undefined,
        },
    })
}

// TODO: hook this up so it prompts the user when more than 1 environment is present in `samconfig.toml`
export function createEnvironmentPrompter(config: SamConfig, environments = config.listEnvironments()) {
    const recentEnvironmentName = getRecentResponse(config.location.fsPath, 'environmentName')
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

export interface TemplateItem {
    readonly uri: vscode.Uri
    readonly data: CloudFormation.Template
}

export function createTemplatePrompter(registry: CloudFormationTemplateRegistry, projectRoot?: vscode.Uri) {
    const folders = new Set<string>()
    const recentTemplatePath = getRecentResponse('global', 'templatePath')
    const filterTemplates = projectRoot
        ? registry.items.filter(({ path: filePath }) => !path.relative(projectRoot.fsPath, filePath).startsWith('..'))
        : registry.items

    const items = filterTemplates.map(({ item, path: filePath }) => {
        const uri = vscode.Uri.file(filePath)
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
        const label = workspaceFolder ? path.relative(workspaceFolder.uri.fsPath, uri.fsPath) : uri.fsPath
        folders.add(workspaceFolder?.name ?? '')

        return {
            label,
            data: { uri, data: item },
            description: workspaceFolder?.name,
            recentlyUsed: recentTemplatePath === uri.fsPath,
        }
    })

    const trimmedItems = folders.size === 1 ? items.map((item) => ({ ...item, description: undefined })) : items
    return createQuickPick(trimmedItems, {
        title: 'Select a SAM/CloudFormation Template',
        placeholder: 'Select a SAM/CloudFormation Template',
        buttons: createCommonButtons(samSyncUrl),
        noItemsFoundItem: {
            label: localize('aws.sam.noWorkspace', 'No SAM template.yaml file(s) found. Select for help'),
            data: undefined,
            onClick: () => openUrl(getSamInitDocUrl()),
        },
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

export class SyncWizard extends Wizard<SyncParams> {
    registry: CloudFormationTemplateRegistry
    public constructor(
        state: Pick<SyncParams, 'deployType'> & Partial<SyncParams>,
        registry: CloudFormationTemplateRegistry,
        shouldPromptExit: boolean = true
    ) {
        super({ initState: state, exitPrompterProvider: shouldPromptExit ? createExitPrompter : undefined })
        this.registry = registry
        this.form.template.bindPrompter(() => createTemplatePrompter(this.registry))
        this.form.projectRoot.setDefault(({ template }) => getProjectRoot(template))

        this.form.paramsSource.bindPrompter(async ({ projectRoot }) => {
            const existValidSamConfig: boolean | undefined = await validateSamSyncConfig(projectRoot)
            return paramsSourcePrompter(existValidSamConfig)
        })
        this.form.region.bindPrompter(() => createRegionPrompter().transform((r) => r.id), {
            showWhen: ({ paramsSource }) =>
                paramsSource === ParamsSource.Flags || paramsSource === ParamsSource.SpecifyAndSave,
        })
        this.form.stackName.bindPrompter(
            ({ region }) => createStackPrompter(new DefaultCloudFormationClient(region!)),
            {
                showWhen: ({ paramsSource }) =>
                    paramsSource === ParamsSource.Flags || paramsSource === ParamsSource.SpecifyAndSave,
            }
        )

        this.form.bucketName.bindPrompter(({ region }) => createBucketPrompter(new DefaultS3Client(region!)), {
            showWhen: ({ paramsSource }) =>
                paramsSource === ParamsSource.Flags || paramsSource === ParamsSource.SpecifyAndSave,
        })

        this.form.ecrRepoUri.bindPrompter(({ region }) => createEcrPrompter(new DefaultEcrClient(region!)), {
            showWhen: ({ template, paramsSource }) =>
                !!template &&
                hasImageBasedResources(template.data) &&
                (paramsSource === ParamsSource.Flags || paramsSource === ParamsSource.SpecifyAndSave),
        })

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
                    paramsSource === ParamsSource.Flags || paramsSource === ParamsSource.SpecifyAndSave,
            }
        )
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
        updateRecentResponse(args.region, 'stackName', data.stackName),
        updateRecentResponse(args.region, 'bucketName', data.bucketName),
        updateRecentResponse(args.region, 'ecrRepoUri', data.ecrRepoUri),
        updateRecentResponse('global', 'templatePath', data.templatePath),
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

export async function getSamCliPathAndVersion() {
    const { path: samCliPath } = await SamCliSettings.instance.getOrDetectSamCli()
    if (samCliPath === undefined) {
        throw new ToolkitError('SAM CLI could not be found', { code: 'MissingExecutable' })
    }

    const info = await new SamCliInfoInvocation(samCliPath).execute()
    const parsedVersion = parse(info.version)
    telemetry.record({ version: info.version })

    if (parsedVersion?.compare('1.53.0') === -1) {
        throw new ToolkitError('SAM CLI version 1.53.0 or higher is required', { code: 'VersionTooLow' })
    }

    return { path: samCliPath, parsedVersion }
}

let oldTerminal: ProcessTerminal | undefined
export async function runInTerminal(proc: ChildProcess, cmd: string) {
    const handleResult = (result?: ChildProcessResult) => {
        if (result && result.exitCode !== 0) {
            const message = `sam ${cmd} exited with a non-zero exit code: ${result.exitCode}`
            if (result.stderr.includes('is up to date')) {
                throw ToolkitError.chain(result.error, message, {
                    code: 'NoUpdateExitCode',
                })
            }
            throw ToolkitError.chain(result.error, message, {
                code: 'NonZeroExitCode',
            })
        }
    }

    // `createTerminal` doesn't work on C9 so we use the output channel instead
    if (isCloud9()) {
        globals.outputChannel.show()

        const result = proc.run({
            onStdout: (text) => globals.outputChannel.append(removeAnsi(text)),
            onStderr: (text) => globals.outputChannel.append(removeAnsi(text)),
        })
        await proc.send('\n')

        return handleResult(await result)
    }

    // The most recent terminal won't get garbage collected until the next run
    if (oldTerminal?.stopped === true) {
        oldTerminal.close()
    }
    const pty = (oldTerminal = new ProcessTerminal(proc))
    const terminal = vscode.window.createTerminal({ pty, name: `SAM ${cmd}` })
    terminal.sendText('\n')
    terminal.show()

    const result = await new Promise<ChildProcessResult>((resolve) => pty.onDidExit(resolve))
    if (pty.cancelled) {
        throw result.error !== undefined
            ? ToolkitError.chain(result.error, 'SAM CLI was cancelled before exiting', { cancelled: true })
            : new CancellationError('user')
    } else {
        return handleResult(result)
    }
}

async function loadLegacyParameterOverrides(template: TemplateItem) {
    try {
        const params = await getOverriddenParameters(template.uri)
        if (!params) {
            return
        }

        return [...params.entries()].map(([k, v]) => `${k}=${v}`)
    } catch (err) {
        getLogger().warn(`sam: unable to load legacy parameter overrides: %s`, err)
    }
}

export async function runSamSync(args: SyncParams) {
    telemetry.record({ lambdaPackageType: args.ecrRepoUri !== undefined ? 'Image' : 'Zip' })

    const { path: samCliPath, parsedVersion } = await getSamCliPathAndVersion()
    const { boundArgs } = await saveAndBindArgs(args)
    const overrides = await loadLegacyParameterOverrides(args.template)
    if (overrides !== undefined) {
        // Leaving this out of the definitions file as this is _very_ niche and specific to the
        // implementation. Plus we would have to redefine `sam_sync` to add it.
        telemetry.record({ isUsingTemplatesJson: true } as any)
        boundArgs.push('--parameter-overrides', ...overrides)
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
    await runInTerminal(sam, 'sync')
    const { paramsSource, stackName, region, projectRoot } = args
    const shouldWriteSyncSamconfigGlobal = paramsSource !== ParamsSource.SamConfig && !!stackName && !!region
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

export const getWorkspaceUri = (template: TemplateItem) => vscode.workspace.getWorkspaceFolder(template.uri)?.uri
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

    if (arg instanceof AWSTreeNodeBase) {
        // "Deploy" command was invoked on a regionNode.
        return { ...baseParams, region: arg.regionCode }
    } else if (arg instanceof vscode.Uri) {
        if (arg.path.endsWith('samconfig.toml')) {
            // "Deploy" command was invoked on a samconfig.toml file.
            const config = await SamConfig.fromConfigFileUri(arg)
            const params = getSyncParamsFromConfig(config)
            const projectRoot = vscode.Uri.joinPath(config.location, '..')
            const templateUri = params.templatePath
                ? vscode.Uri.file(path.resolve(projectRoot.fsPath, params.templatePath))
                : undefined
            const template = templateUri
                ? {
                      uri: templateUri,
                      data: await CloudFormation.load(templateUri.fsPath),
                  }
                : undefined
            // Always use the dependency layer if the user specified to do so
            const skipDependencyLayer = !config.getCommandParam('sync', 'dependency_layer')

            return { ...baseParams, ...params, template, projectRoot, skipDependencyLayer }
        }

        // "Deploy" command was invoked on a template.yaml file.
        const template = {
            uri: arg,
            data: await CloudFormation.load(arg.fsPath, validate),
        }

        return { ...baseParams, template, projectRoot: getProjectRootUri(template.uri) }
    } else if (arg && arg.getTreeItem()) {
        // "Deploy" command was invoked on a TreeNode on the AppBuilder.
        const templateUri = (arg.getTreeItem() as vscode.TreeItem).resourceUri
        if (templateUri) {
            const template = {
                uri: templateUri,
                data: await CloudFormation.load(templateUri.fsPath, validate),
            }
            return { ...baseParams, template, projectRoot: getProjectRootUri(template.uri) }
        }
    }

    return baseParams
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
            throw ToolkitError.chain(err, 'Failed to sync SAM application', { details: { ...params } })
        }
    })
}

const mementoRootKey = 'samcli.sync.params'
export function getRecentResponse(region: string, key: string): string | undefined {
    const root = globals.context.workspaceState.get(mementoRootKey, {} as Record<string, Record<string, string>>)

    return root[region]?.[key]
}

export async function updateRecentResponse(region: string, key: string, value: string | undefined) {
    try {
        const root = globals.context.workspaceState.get(mementoRootKey, {} as Record<string, Record<string, string>>)
        await globals.context.workspaceState.update(mementoRootKey, {
            ...root,
            [region]: { ...root[region], [key]: value },
        })
    } catch (err) {
        getLogger().warn(`sam: unable to save response at key "${key}": %s`, err)
    }
}

export async function confirmDevStack() {
    const canPrompt = await ToolkitPromptSettings.instance.isPromptEnabled('samcliConfirmDevStack')
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

// This is a decent improvement over using the output channel but it isn't a tty/pty
// SAM CLI uses `click` which has reduced functionality if `os.isatty` returns false
// Historically, Windows lack of a pty-equivalent is why it's not available in libuv
// Maybe it's doable now with the ConPTY API? https://github.com/libuv/libuv/issues/2640
class ProcessTerminal implements vscode.Pseudoterminal {
    private readonly onDidCloseEmitter = new vscode.EventEmitter<number | void>()
    private readonly onDidWriteEmitter = new vscode.EventEmitter<string>()
    private readonly onDidExitEmitter = new vscode.EventEmitter<ChildProcessResult>()
    public readonly onDidWrite = this.onDidWriteEmitter.event
    public readonly onDidClose = this.onDidCloseEmitter.event
    public readonly onDidExit = this.onDidExitEmitter.event

    public constructor(private readonly process: ChildProcess) {
        // Used in integration tests
        if (isAutomation()) {
            // Disable because it is a test.
            // eslint-disable-next-line aws-toolkits/no-console-log
            this.onDidWrite((text) => console.log(text.trim()))
        }
    }

    #cancelled = false
    public get cancelled() {
        return this.#cancelled
    }

    public get stopped() {
        return this.process.stopped
    }

    public open(initialDimensions: vscode.TerminalDimensions | undefined): void {
        this.process
            .run({
                onStdout: (text) => this.mapStdio(text),
                onStderr: (text) => this.mapStdio(text),
            })
            .then((result) => this.onDidExitEmitter.fire(result))
            .catch((err) =>
                this.onDidExitEmitter.fire({ error: UnknownError.cast(err), exitCode: -1, stderr: '', stdout: '' })
            )
            .finally(() => this.onDidWriteEmitter.fire('\r\nPress any key to close this terminal'))
    }

    public close(): void {
        this.process.stop()
        this.onDidCloseEmitter.fire()
    }

    public handleInput(data: string) {
        // ETX
        if (data === '\u0003' || this.process.stopped) {
            this.#cancelled ||= data === '\u0003'
            return this.close()
        }

        // enter
        if (data === '\u000D') {
            this.process.send('\n').then(undefined, (e) => {
                getLogger().error('ProcessTerminal: process.send() failed: %s', (e as Error).message)
            })
            this.onDidWriteEmitter.fire('\r\n')
        } else {
            this.process.send(data).then(undefined, (e) => {
                getLogger().error('ProcessTerminal: process.send() failed: %s', (e as Error).message)
            })
            this.onDidWriteEmitter.fire(data)
        }
    }

    private mapStdio(text: string): void {
        const lines = text.split('\n')
        const first = lines.shift()

        if (first) {
            this.onDidWriteEmitter.fire(first)
        }

        for (const line of lines) {
            this.onDidWriteEmitter.fire('\r\n')
            this.onDidWriteEmitter.fire(line)
        }
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
