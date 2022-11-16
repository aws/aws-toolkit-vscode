/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'

import * as vscode from 'vscode'
import * as path from 'node:path'
import * as localizedText from '../localizedText'
import { DefaultS3Client } from '../clients/s3Client'
import { Wizard } from '../wizards/wizard'
import { createQuickPick } from '../ui/pickerPrompter'
import { DefaultCloudFormationClient } from '../clients/cloudFormationClient'
import { CloudFormation } from '../cloudformation/cloudformation'
import { DefaultEcrClient } from '../clients/ecrClient'
import { createRegionPrompter } from '../ui/common/region'
import { CancellationError } from '../utilities/timeoutUtils'
import { ChildProcess, ChildProcessResult } from '../utilities/childProcess'
import { selectFrom } from '../utilities/tsUtils'
import { Commands } from '../vscode/commands2'
import { AWSTreeNodeBase } from '../treeview/nodes/awsTreeNodeBase'
import { SystemUtilities } from '../systemUtilities'
import { ToolkitError, UnknownError } from '../errors'
import { telemetry } from '../telemetry/telemetry'
import { createCommonButtons } from '../ui/buttons'
import { PromptSettings } from '../settings'
import { getLogger } from '../logger'
import { isCloud9 } from '../extensionUtilities'
import { removeAnsi } from '../utilities/textUtilities'
import { createExitPrompter } from '../ui/common/exitPrompter'

const generatedBucket = Symbol('generatedBucket')

interface SyncParams {
    readonly region: string
    readonly deployType: 'infra' | 'code'
    readonly projectRoot: vscode.Uri
    readonly template: TemplateItem
    readonly stackName: string
    readonly bucketName: string | typeof generatedBucket
    readonly ecrRepoUri?: string
}

/*
const useGeneratedBucketItem = {
    label: 'Generate one for me',
    data: generatedBucket,
}
*/

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
        title: 'Choose a bucket to use for deployment',
        buttons: createCommonButtons(),
    })
}

function createStackPrompter(client: DefaultCloudFormationClient) {
    const recentStack = getRecentResponse(client.regionCode, 'stackName')
    const items = client.listAllStacks().map(stacks =>
        stacks
            .filter(s => s.StackStatus.endsWith('_COMPLETE') && !s.StackStatus.includes('DELETE'))
            .map(s => ({
                label: s.StackName,
                description: s.StackStatus,
                data: s.StackName,
                recentlyUsed: s.StackName === recentStack,
            }))
    )

    return createQuickPick(items, {
        title: 'Select a stack or create a new one by entering a name',
        filterBoxInputSettings: {
            label: 'Create a new stack',
            transform: v => v,
        },
        buttons: createCommonButtons(),
    })
}

function createEcrPrompter(client: DefaultEcrClient) {
    const recentEcrRepo = getRecentResponse(client.regionCode, 'ecrRepoUri')
    const items = client.listAllRepositories().map(list =>
        list.map(repo => ({
            label: repo.repositoryName,
            data: repo.repositoryUri,
            detail: repo.repositoryArn,
            recentlyUsed: repo.repositoryUri === recentEcrRepo,
        }))
    )

    return createQuickPick(items, {
        title: 'Select an ECR repo to deploy images to',
        buttons: createCommonButtons(),
    })
}

interface TemplateItem {
    readonly uri: vscode.Uri
    readonly data: CloudFormation.Template
}

function createTemplatePrompter() {
    const folders = new Set<string>()
    const items = globals.templateRegistry.registeredItems.map(({ item, path: filePath }) => {
        const uri = vscode.Uri.file(filePath)
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
        const label = workspaceFolder ? path.relative(workspaceFolder.uri.fsPath, uri.fsPath) : uri.fsPath
        folders.add(workspaceFolder?.name ?? '')

        return {
            label,
            data: { uri, data: item },
            description: workspaceFolder?.name,
        }
    })

    const trimmedItems = folders.size === 1 ? items.map(item => ({ ...item, description: undefined })) : items
    return createQuickPick(trimmedItems, {
        title: 'Select a template',
        buttons: createCommonButtons(),
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

class SyncWizard extends Wizard<SyncParams> {
    public constructor(state: Pick<SyncParams, 'deployType'>) {
        super({ initState: state, exitPrompterProvider: createExitPrompter })

        this.form.region.bindPrompter(() => createRegionPrompter().transform(r => r.id))
        this.form.template.bindPrompter(() => createTemplatePrompter())
        this.form.stackName.bindPrompter(({ region }) => createStackPrompter(new DefaultCloudFormationClient(region!)))
        this.form.bucketName.bindPrompter(({ region }) => createBucketPrompter(new DefaultS3Client(region!)))
        this.form.ecrRepoUri.bindPrompter(({ region }) => createEcrPrompter(new DefaultEcrClient(region!)), {
            showWhen: ({ template }) => !!template && hasImageBasedResources(template.data),
        })

        const getProjectRoot = (template: TemplateItem | undefined) =>
            template ? vscode.workspace.getWorkspaceFolder(template.uri)?.uri : undefined

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

export async function runSamSync(args?: Partial<SyncParams>) {
    const resp = await new SyncWizard({ deployType: 'infra', ...args }).run()
    if (resp === undefined) {
        throw new CancellationError('user')
    }

    telemetry.record({ lambdaPackageType: resp.ecrRepoUri !== undefined ? 'Image' : 'Zip' })

    const data = {
        codeOnly: resp.deployType === 'code',
        templatePath: resp.template.uri.fsPath,
        bucketName: resp.bucketName !== generatedBucket ? resp.bucketName : undefined,
        ...selectFrom(resp, 'stackName', 'ecrRepoUri', 'region'),
    }

    await Promise.all([
        updateRecentResponse(resp.region, 'stackName', data.stackName),
        updateRecentResponse(resp.region, 'bucketName', data.bucketName),
        updateRecentResponse(resp.region, 'ecrRepoUri', data.ecrRepoUri),
    ])

    const params = bindDataToParams(data, {
        region: '--region',
        codeOnly: '--code',
        templatePath: '--template',
        stackName: '--stack-name',
        bucketName: '--s3-bucket',
        ecrRepoUri: '--image-repository',
    })

    // TODO: use `SamCliContext` for the executable path
    const sam = new ChildProcess('sam', ['sync', ...params], {
        spawnOptions: {
            cwd: resp.projectRoot.fsPath,
        },
    })

    const handleResult = (result?: ChildProcessResult) => {
        if (result && result.exitCode !== 0) {
            const message = `SAM sync exited with a non-zero exit code: ${result.exitCode}`
            throw ToolkitError.chain(result.error, message, {
                code: 'NonZeroExitCode',
            })
        }
    }

    // `createTerminal` doesn't work on C9 so we use the output channel instead
    if (isCloud9()) {
        globals.outputChannel.show()

        const result = await sam.run({
            onStdout: text => globals.outputChannel.appendLine(removeAnsi(text)),
            onStderr: text => globals.outputChannel.appendLine(removeAnsi(text)),
        })

        return handleResult(result)
    }

    const pty = new ProcessTerminal(sam)
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

async function setupSyncParams(arg: vscode.Uri | AWSTreeNodeBase | undefined) {
    const region = arg instanceof AWSTreeNodeBase ? arg.regionCode : undefined
    const template =
        arg instanceof vscode.Uri
            ? {
                  uri: arg,
                  data: await CloudFormation.load(arg.fsPath),
              }
            : undefined

    // TODO: dedupe
    const configFile = template !== undefined ? vscode.Uri.joinPath(template.uri, '..', 'samconfig.toml') : undefined
    const projectRoot =
        configFile !== undefined && (await SystemUtilities.fileExists(configFile))
            ? vscode.Uri.joinPath(configFile, '..')
            : undefined

    return { region, template, projectRoot }
}

export function registerSync() {
    function isValidParam(arg?: unknown): arg is vscode.Uri | AWSTreeNodeBase | undefined {
        return arg === undefined || arg instanceof vscode.Uri || arg instanceof AWSTreeNodeBase
    }

    Commands.register(
        {
            id: 'aws.samcli.sync',
            autoconnect: true,
        },
        async (arg?: unknown) => {
            return telemetry.sam_sync.run(async span => {
                span.record({ syncedResources: 'AllResources' })
                if (isValidParam(arg)) {
                    await confirmDevStack()
                    await runSamSync({ deployType: 'infra', ...(await setupSyncParams(arg)) })
                }
            })
        }
    )

    Commands.register(
        {
            id: 'aws.samcli.syncCode',
            autoconnect: true,
        },
        async (arg?: unknown) => {
            return telemetry.sam_sync.run(async span => {
                span.record({ syncedResources: 'CodeOnly' })
                if (isValidParam(arg)) {
                    await confirmDevStack()
                    await runSamSync({ deployType: 'code', ...(await setupSyncParams(arg)) })
                }
            })
        }
    )
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
        getLogger().warn(`sam: unable to save response at key "${key}": ${UnknownError.cast(err).message}`)
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

    public constructor(private readonly process: ChildProcess) {}

    #cancelled = false
    public get cancelled() {
        return this.#cancelled
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
        // EOF
        if (data === '\u0003' || this.process.stopped) {
            this.#cancelled ||= data === '\u0003'
            return this.close()
        }

        // enter
        if (data === '\u000D') {
            this.process.send('\n') // is CRLF ok here?
            this.onDidWriteEmitter.fire('\r\n')
        } else {
            this.process.send(data)
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
