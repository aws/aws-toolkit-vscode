/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { Executable, LanguageClient, LanguageClientOptions } from 'vscode-languageclient/node'
import fs from '../../../shared/fs/fs'
import { getLogger } from '../../../shared/logger/logger'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { mergeResolvedShellPath } from '../../../shared/env/resolveEnv'
import { detectCdkProjects } from '../explorer/detectCdkProjects'
import { CdkCliSource, meetsMinimum, minimumCdkLspVersion, resolveCdkCli } from './cdkCliResolver'

const logger = getLogger('cdkLsp')

/** The part of {@link LanguageClient} we use. */
export type CdkLanguageClient = Pick<LanguageClient, 'start' | 'stop'>

/** What {@link CdkLanguageServer} needs from its surroundings; injectable for tests. */
export interface CdkLspDeps {
    createClient(executable: Executable, options: LanguageClientOptions): CdkLanguageClient
    /** Directories containing a cdk.json in the workspace. */
    detectAppDirs(): Promise<string[]>
    getSetting(name: 'appDir' | 'cliPath'): string | undefined
    isTrusted(): boolean
}

const defaultDeps: CdkLspDeps = {
    createClient: (executable, options) => new LanguageClient('cdkLsp', 'CDK Language Server', executable, options),
    detectAppDirs: async () => (await detectCdkProjects()).map((p) => path.dirname(p.cdkJsonUri.fsPath)),
    getSetting: (name) => vscode.workspace.getConfiguration('aws.cdk').get<string>(name)?.trim() || undefined,
    isTrusted: () => vscode.workspace.isTrusted,
}

/**
 * Wire the CDK language server. Registers listeners synchronously and starts
 * the server in the background. Safe when there is no CDK project (no-op).
 */
export function activateCdkLsp(context: vscode.ExtensionContext): void {
    // One channel for the window, reused across restarts. A client-owned channel
    // is not disposed when start fails, so restarts would pile up duplicates.
    const outputChannel = vscode.window.createOutputChannel('CDK Language Server')
    const server = new CdkLanguageServer(outputChannel)
    context.subscriptions.push(
        // CodeLens command the LSP emits (OPEN_RESOURCE_COMMAND in cdk-explorer):
        // open a synthesized-template resource, or a picker when several share a line.
        vscode.commands.registerCommand('cdkExplorer.openResource', openResourceCommand),
        server,
        outputChannel,
        ...watchRestartTriggers(() => void server.restart())
    )
    void server.restart()
}

/** Call `restart` on the events that can change which app dir (if any) we serve, or how. */
export function watchRestartTriggers(restart: () => void): vscode.Disposable[] {
    const onCdkJsonChange = (uri: vscode.Uri) => {
        // Ignore vendored fixtures under node_modules.
        if (!uri.fsPath.includes(`${path.sep}node_modules${path.sep}`)) {
            restart()
        }
    }
    const cdkJsonWatcher = vscode.workspace.createFileSystemWatcher('**/cdk.json')
    return [
        cdkJsonWatcher,
        cdkJsonWatcher.onDidCreate(onCdkJsonChange),
        cdkJsonWatcher.onDidDelete(onCdkJsonChange),
        vscode.workspace.onDidChangeWorkspaceFolders(restart),
        vscode.workspace.onDidGrantWorkspaceTrust(restart),
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('aws.cdk.appDir') || e.affectsConfiguration('aws.cdk.cliPath')) {
                restart()
            }
        }),
    ]
}

/**
 * A single CDK language server serves one app directory (the server accepts one
 * `applicationDir`). We deliberately run ONE client per window rather than one
 * per cdk.json: vscode-languageclient auto-registers the server's
 * executeCommandProvider commands via `vscode.commands.registerCommand`, which
 * throws on a duplicate id, so N clients in a multi-app workspace would fail to
 * start. The app dir is the `aws.cdk.appDir` setting, else the first detected
 * CDK app (with a hint to set the setting when several are found).
 */
export class CdkLanguageServer implements vscode.Disposable {
    private client: CdkLanguageClient | undefined
    private restarting: Promise<void> = Promise.resolve()

    constructor(
        private readonly outputChannel: vscode.OutputChannel,
        private readonly deps: CdkLspDeps = defaultDeps
    ) {}

    /** Restarts run one after another so overlapping triggers never leak a client. */
    public restart(): Promise<void> {
        return (this.restarting = this.restarting.then(() => this.restartClient()))
    }

    public dispose(): void {
        void this.stop()
    }

    public async stop(): Promise<void> {
        const stopping = this.client?.stop().catch(() => {})
        this.client = undefined
        await stopping
    }

    /** Resolve the single CDK app directory to serve, or undefined to stay off. */
    private async resolveAppDir(): Promise<string | undefined> {
        const configured = this.deps.getSetting('appDir')
        if (configured) {
            const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            const dir = path.isAbsolute(configured) ? configured : root && path.join(root, configured)
            if (!dir || !(await fs.existsDir(dir))) {
                notify(`aws.cdk.appDir "${configured}" is not an existing directory.`)
                return undefined
            }
            return dir
        }

        // Activation gate: reuse the explorer's cdk.json detection so we never spawn
        // in a non-CDK workspace.
        const dirs = (await this.deps.detectAppDirs()).sort()
        if (dirs.length > 1) {
            notify(`Multiple CDK apps found. Using ${dirs[0]}. Set aws.cdk.appDir to choose a different one.`)
        }
        return dirs[0]
    }

    /** Stop any running client, then (re)resolve and start one for the current app dir. */
    private async restartClient(): Promise<void> {
        await this.stop()
        // `cdk lsp` runs workspace code (the local CLI and the app's synth), so never in an untrusted workspace.
        if (!this.deps.isTrusted()) {
            return
        }
        let version: string | undefined
        let source: CdkCliSource | undefined
        try {
            const appDir = await this.resolveAppDir()
            if (!appDir) {
                return
            }

            const env = await mergeResolvedShellPath(process.env)
            const resolved = await resolveCdkCli(appDir, env, this.deps.getSetting('cliPath'))
            if (!resolved) {
                notify(
                    `CDK language features need the AWS CDK CLI. Install it (>= ${minimumCdkLspVersion}) or set aws.cdk.cliPath.`
                )
                telemetry.cdk_startLanguageServer.emit({ result: 'Failed', reason: 'cdkCliNotFound' })
                return
            }

            // Only a workspace-local install tells us its version without spawning;
            // otherwise an old CLI just fails to start below.
            version = resolved.version
            source = resolved.source
            if (version && !meetsMinimum(version)) {
                notify(
                    `AWS CDK CLI ${version} is too old for language features. Upgrade to >= ${minimumCdkLspVersion}.`
                )
                telemetry.cdk_startLanguageServer.emit({
                    result: 'Failed',
                    reason: 'cdkCliOutdated',
                    cdkCliSource: source,
                    cdkCliVersion: version,
                })
                return
            }

            this.client = this.deps.createClient(
                toExecutable(resolved.command, resolved.args, appDir, env),
                this.clientOptions(appDir)
            )
            logger.info(`Starting \`cdk lsp\` for ${appDir} (${resolved.command} via ${resolved.source})`)
            await this.client.start()
            telemetry.cdk_startLanguageServer.emit({
                result: 'Succeeded',
                cdkCliSource: source,
                cdkCliVersion: version,
            })
        } catch (err) {
            logger.error(`Failed to start cdk lsp: %O`, err)
            notify(
                `Could not start the CDK language server. It needs AWS CDK CLI >= ${minimumCdkLspVersion}; see the "CDK Language Server" output for details.`
            )
            telemetry.cdk_startLanguageServer.emit({
                result: 'Failed',
                reason: 'startError',
                cdkCliSource: source,
                cdkCliVersion: version,
            })
            await this.stop()
        }
    }

    private clientOptions(appDir: string): LanguageClientOptions {
        return {
            // Source-linked features currently cover only JS/TS, plus
            // synthesized templates for template -> construct go-to-definition.
            documentSelector: [
                { scheme: 'file', language: 'javascript' },
                { scheme: 'file', language: 'typescript' },
                { scheme: 'file', pattern: '**/*.template.json' },
            ],
            initializationOptions: { applicationDir: appDir },
            outputChannel: this.outputChannel,
            workspaceFolder: vscode.workspace.getWorkspaceFolder(vscode.Uri.file(appDir)),
        }
    }
}

/** Non-blocking, dismissible. */
function notify(message: string): void {
    void vscode.window.showInformationMessage(message)
}

/** How to spawn `command args` for vscode-languageclient. */
export function toExecutable(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Executable {
    // Node can only spawn a Windows `.cmd` shim through a shell. The command is an
    // absolute path; quote it so a path with spaces survives cmd.exe.
    const shell = /\.cmd$/i.test(command)
    return {
        command: shell ? `"${command}"` : command,
        args,
        // No `transport`: it still talks over stdio, but `TransportKind.stdio` appends a
        // `--stdio` arg that `cdk lsp` rejects as an unknown option.
        options: { cwd, env, shell },
    }
}

/** A resource target the server attaches to its `cdkExplorer.openResource` CodeLenses. */
export interface ResourceChoice extends vscode.QuickPickItem {
    target: {
        uri: string
        range: { start: { line: number; character: number }; end: { line: number; character: number } }
    }
}

/**
 * Handler for the `cdkExplorer.openResource` CodeLens command the server emits.
 * `choices` are QuickPick-shaped resource targets ({ label: CFN type,
 * description: construct name, target: { uri, range } }).
 */
export async function openResourceCommand(choices: ResourceChoice[]): Promise<void> {
    const chosen =
        choices.length === 1
            ? choices[0]
            : await vscode.window.showQuickPick(choices, {
                  placeHolder: 'Open resource in synthesized template',
                  matchOnDescription: true,
              })
    if (!chosen) {
        return
    }
    const { start, end } = chosen.target.range
    await vscode.window.showTextDocument(vscode.Uri.parse(chosen.target.uri), {
        selection: new vscode.Range(start.line, start.character, end.line, end.character),
    })
}
