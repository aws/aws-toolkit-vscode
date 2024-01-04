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
import { createQuickPick } from '../ui/pickerPrompter'
import { DefaultCloudFormationClient } from '../clients/cloudFormationClient'
import * as CloudFormation from '../cloudformation/cloudformation'
import { DefaultEcrClient } from '../clients/ecrClient'
import { createRegionPrompter } from '../ui/common/region'
import { CancellationError } from '../utilities/timeoutUtils'
import { ChildProcess, ChildProcessResult } from '../utilities/childProcess'
import { keys, selectFrom } from '../utilities/tsUtils'
import { Commands } from '../vscode/commands2'
import { AWSTreeNodeBase } from '../treeview/nodes/awsTreeNodeBase'
import { ToolkitError, UnknownError } from '../errors'
import { telemetry } from '../telemetry/telemetry'
import { createCommonButtons } from '../ui/buttons'
import { PromptSettings } from '../settings'
import { getLogger } from '../logger'
import { isCloud9 } from '../extensionUtilities'
import { removeAnsi } from '../utilities/textUtilities'
import { createExitPrompter } from '../ui/common/exitPrompter'
import { StackSummary } from 'aws-sdk/clients/cloudformation'
import { SamCliSettings } from './cli/samCliSettings'
import { SamConfig } from './config'
import { cast, Instance, Optional, Union } from '../utilities/typeConstructors'
import { pushIf, toRecord } from '../utilities/collectionUtils'
import { Auth } from '../../auth/auth'
import { asEnvironmentVariables } from '../../auth/credentials/utils'
import { SamCliInfoInvocation } from './cli/samCliInfo'
import { parse } from 'semver'
import { isAutomation } from '../vscode/env'
import { getOverriddenParameters } from '../../lambda/config/parameterUtils'
import { addTelemetryEnvVar } from './cli/samCliInvokerUtils'
import { samSyncUrl, samInitDocUrl, samUpgradeUrl } from '../constants'
import { getAwsConsoleUrl } from '../awsConsole'
import { openUrl } from '../utilities/vsCodeUtils'
import { showOnce } from '../utilities/messages'
import { IamConnection } from '../../auth/connection'
import { CloudFormationTemplateRegistry } from '../fs/templateRegistry'

const localize = nls.loadMessageBundle()

export interface SyncParams {
    readonly region: string
    readonly deployType: 'infra' | 'code'
    readonly projectRoot: vscode.Uri
    readonly template: TemplateItem
    readonly stackName: string
    readonly bucketName: string
    readonly ecrRepoUri?: string
    readonly connection: IamConnection
    readonly skipDependencyLayer?: boolean
}

export const prefixNewBucketName = (name: string) => `newbucket:${name}`
export const prefixNewRepoName = (name: string) => `newrepo:${name}`

function createBucketPrompter(client: DefaultS3Client) {
    const recentBucket = getRecentResponse(client.regionCode, 'bucketName')
    const items = client.listBucketsIterable().map(b => [
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
            transform: v => prefixNewBucketName(v),
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

function createStackPrompter(client: DefaultCloudFormationClient) {
    const recentStack = getRecentResponse(client.regionCode, 'stackName')
    const consoleUrl = getAwsConsoleUrl('cloudformation', client.regionCode)
    const items = client.listAllStacks().map(stacks =>
        stacks.filter(canShowStack).map(s => ({
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
            transform: v => v,
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

function createEcrPrompter(client: DefaultEcrClient) {
    const recentEcrRepo = getRecentResponse(client.regionCode, 'ecrRepoUri')
    const consoleUrl = getAwsConsoleUrl('ecr', client.regionCode)
    const items = client.listAllRepositories().map(list =>
        list.map(repo => ({
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
            transform: v => prefixNewRepoName(v),
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
    const items = environments.map(env => ({
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

interface TemplateItem {
    readonly uri: vscode.Uri
    readonly data: CloudFormation.Template
}

function createTemplatePrompter(registry: CloudFormationTemplateRegistry) {
    const folders = new Set<string>()
    const recentTemplatePath = getRecentResponse('global', 'templatePath')
    const items = registry.items.map(({ item, path: filePath }) => {
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

    const trimmedItems = folders.size === 1 ? items.map(item => ({ ...item, description: undefined })) : items
    return createQuickPick(trimmedItems, {
        title: 'Select a SAM CloudFormation Template',
        placeholder: 'Select a SAM template.yaml file',
        buttons: createCommonButtons(samSyncUrl),
        noItemsFoundItem: {
            label: localize('aws.sam.noWorkspace', 'No SAM template.yaml file(s) found. Select for help'),
            data: undefined,
            onClick: () => openUrl(samInitDocUrl),
        },
    })
}

function hasImageBasedResources(template: CloudFormation.Template) {
    const resources = template.Resources

    return resources === undefined
        ? false
        : Object.keys(resources)
              .filter(key => resources[key]?.Type === 'AWS::Serverless::Function')
              .map(key => resources[key]?.Properties?.PackageType)
              .some(it => it === 'Image')
}

export class SyncWizard extends Wizard<SyncParams> {
    public constructor(
        state: Pick<SyncParams, 'deployType'> & Partial<SyncParams>,
        registry: CloudFormationTemplateRegistry
    ) {
        super({ initState: state, exitPrompterProvider: createExitPrompter })

        this.form.region.bindPrompter(() => createRegionPrompter().transform(r => r.id))
        this.form.template.bindPrompter(() => createTemplatePrompter(registry))
        this.form.stackName.bindPrompter(({ region }) => createStackPrompter(new DefaultCloudFormationClient(region!)))
        this.form.bucketName.bindPrompter(({ region }) => createBucketPrompter(new DefaultS3Client(region!)))
        this.form.ecrRepoUri.bindPrompter(({ region }) => createEcrPrompter(new DefaultEcrClient(region!)), {
            showWhen: ({ template }) => !!template && hasImageBasedResources(template.data),
        })

        const getProjectRoot = (template: TemplateItem | undefined) =>
            template ? getWorkspaceUri(template) : undefined

        this.form.projectRoot.setDefault(({ template }) => getProjectRoot(template))
    }
}

type BindableData = Record<string, string | boolean | undefined>
function bindDataToParams<T extends BindableData>(data: T, bindings: { [P in keyof T]-?: string }): string[] {
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

async function ensureBucket(resp: Pick<SyncParams, 'region' | 'bucketName'>) {
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

async function ensureRepo(resp: Pick<SyncParams, 'region' | 'ecrRepoUri'>) {
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

async function injectCredentials(conn: IamConnection, env = process.env) {
    const creds = await conn.getCredentials()
    return { ...env, ...asEnvironmentVariables(creds) }
}

async function saveAndBindArgs(args: SyncParams): Promise<{ readonly boundArgs: string[] }> {
    const data = {
        codeOnly: args.deployType === 'code',
        templatePath: args.template.uri.fsPath,
        bucketName: await ensureBucket(args),
        ecrRepoUri: await ensureRepo(args),
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

    return { boundArgs }
}

async function getSamCliPathAndVersion() {
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
async function runSyncInTerminal(proc: ChildProcess) {
    const handleResult = (result?: ChildProcessResult) => {
        if (result && result.exitCode !== 0) {
            const message = `sam sync exited with a non-zero exit code: ${result.exitCode}`
            throw ToolkitError.chain(result.error, message, {
                code: 'NonZeroExitCode',
            })
        }
    }

    // `createTerminal` doesn't work on C9 so we use the output channel instead
    if (isCloud9()) {
        globals.outputChannel.show()

        const result = proc.run({
            onStdout: text => globals.outputChannel.append(removeAnsi(text)),
            onStderr: text => globals.outputChannel.append(removeAnsi(text)),
        })
        await proc.send('\n')

        return handleResult(await result)
    }

    // The most recent terminal won't get garbage collected until the next run
    if (oldTerminal?.stopped === true) {
        oldTerminal.close()
    }
    const pty = (oldTerminal = new ProcessTerminal(proc))
    const terminal = vscode.window.createTerminal({ pty, name: 'SAM Sync' })
    terminal.sendText('\n')
    terminal.show()

    const result = await new Promise<ChildProcessResult>(resolve => pty.onDidExit(resolve))
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

    if ((parsedVersion?.compare('1.78.0') ?? 1) < 0) {
        await showOnce('sam.sync.updateMessage', async () => {
            const message = `Your current version of SAM CLI (${parsedVersion?.version}) does not include performance improvements for "sam sync". Update to 1.78.0 or higher for faster deployments.`
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

    const sam = new ChildProcess(samCliPath, ['sync', ...boundArgs], {
        spawnOptions: await addTelemetryEnvVar({
            cwd: args.projectRoot.fsPath,
            env: await injectCredentials(args.connection),
        }),
    })

    await runSyncInTerminal(sam)
}

const getWorkspaceUri = (template: TemplateItem) => vscode.workspace.getWorkspaceFolder(template.uri)?.uri
const getStringParam = (config: SamConfig, key: string) => {
    try {
        return cast(config.getParam('sync', key), Optional(String))
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

function getSyncParamsFromConfig(config: SamConfig) {
    const samConfigParams: string[] = []
    const params = toRecord(keys(configKeyMapping), k => {
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
    arg: vscode.Uri | AWSTreeNodeBase | undefined,
    validate?: boolean
): Promise<Partial<SyncParams>> {
    // Skip creating dependency layers by default for backwards compat
    const baseParams: Partial<SyncParams> = { skipDependencyLayer: true }

    if (arg instanceof AWSTreeNodeBase) {
        return { ...baseParams, region: arg.regionCode }
    } else if (arg instanceof vscode.Uri) {
        if (arg.path.endsWith('samconfig.toml')) {
            const config = await SamConfig.fromUri(arg)
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
            const skipDependencyLayer = !config.getParam('sync', 'dependency_layer')

            return { ...baseParams, ...params, template, projectRoot, skipDependencyLayer }
        }

        const template = {
            uri: arg,
            data: await CloudFormation.load(arg.fsPath, validate),
        }

        return { ...baseParams, template, projectRoot: getWorkspaceUri(template) }
    }

    return baseParams
}

export type SamSyncResult = {
    isSuccess: boolean
}

export function registerSync() {
    async function runSync(
        deployType: SyncParams['deployType'],
        arg?: unknown,
        validate?: boolean
    ): Promise<SamSyncResult> {
        telemetry.record({ syncedResources: deployType === 'infra' ? 'AllResources' : 'CodeOnly' })

        const connection = Auth.instance.activeConnection
        if (connection?.type !== 'iam') {
            throw new ToolkitError('Syncing SAM applications requires IAM credentials', { code: 'NoIAMCredentials' })
        }

        // Constructor of `vscode.Uri` is marked private but that shouldn't matter when checking the instance type
        const Uri = vscode.Uri as unknown as abstract new () => vscode.Uri
        const input = cast(arg, Optional(Union(Instance(Uri), Instance(AWSTreeNodeBase))))

        await confirmDevStack()
        const registry = await globals.templateRegistry
        const params = await new SyncWizard(
            { deployType, ...(await prepareSyncParams(input, validate)) },
            registry
        ).run()
        if (params === undefined) {
            throw new CancellationError('user')
        }

        try {
            await runSamSync({ ...params, connection })
            return {
                isSuccess: true,
            }
        } catch (err) {
            throw ToolkitError.chain(err, 'Failed to sync SAM application', { details: { ...params } })
        }
    }

    Commands.register(
        {
            id: 'aws.samcli.sync',
            autoconnect: true,
        },
        (arg?: unknown, validate?: boolean) => telemetry.sam_sync.run(() => runSync('infra', arg, validate))
    )

    const settings = SamCliSettings.instance
    settings.onDidChange(({ key }) => {
        if (key === 'legacyDeploy') {
            telemetry.aws_modifySetting.run(span => {
                span.record({ settingId: 'sam_legacyDeploy' })
                const state = settings.get('legacyDeploy')
                span.record({ settingState: state ? 'Enabled' : 'Disabled' })
            })
        }
    })
}

const mementoRootKey = 'samcli.sync.params'
function getRecentResponse(region: string, key: string): string | undefined {
    const root = globals.context.workspaceState.get(mementoRootKey, {} as Record<string, Record<string, string>>)

    return root[region]?.[key]
}

async function updateRecentResponse(region: string, key: string, value: string | undefined) {
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

async function confirmDevStack() {
    const canPrompt = await PromptSettings.instance.isPromptEnabled('samcliConfirmDevStack')
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
        await PromptSettings.instance.disablePrompt('samcliConfirmDevStack')
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
            this.onDidWrite(text => console.log(text.trim()))
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
                onStdout: text => this.mapStdio(text),
                onStderr: text => this.mapStdio(text),
            })
            .then(result => this.onDidExitEmitter.fire(result))
            .catch(err =>
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
            this.process.send('\n').then(undefined, e => {
                getLogger().error('ProcessTerminal: process.send() failed: %s', (e as Error).message)
            })
            this.onDidWriteEmitter.fire('\r\n')
        } else {
            this.process.send(data).then(undefined, e => {
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
