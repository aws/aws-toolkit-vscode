/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import {
    Executable,
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    State,
    TransportKind,
} from 'vscode-languageclient/node'
import { getLogger } from '../../../shared/logger/logger'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { detectCdkProjects } from '../explorer/detectCdkProjects'
import { buildCdkSpawnEnv, meetsMinimum, minimumCdkLspVersion, probeCdkVersion, resolveCdkCli } from './cdkCliResolver'

const logger = getLogger('cdkLsp')

/**
 * A single CDK language server serves one app directory (the server accepts one
 * `applicationDir`). We deliberately run ONE client per window rather than one
 * per cdk.json: vscode-languageclient auto-registers the server's
 * executeCommandProvider commands via `vscode.commands.registerCommand`, which
 * throws on a duplicate id, so N clients in a multi-app workspace would fail to
 * start. The app dir is the `aws.cdk.appDir` setting, else the sole detected
 * CDK app (with a hint to set the setting when several are found).
 */
let client: LanguageClient | undefined
let outputChannel: vscode.OutputChannel | undefined
/** Message kinds surfaced since the last (re)start, so we notify at most once. */
const notified = new Set<string>()
/** Serializes (re)starts into a queue-of-one so overlapping triggers never leak a client. */
let restartInFlight: Promise<void> = Promise.resolve()
let restartQueued = false

/**
 * Wire the CDK language server. Registers listeners synchronously and starts
 * the server in the background; never blocks extension activation on the
 * shell-env resolve or version probe. Safe when there is no CDK project (no-op).
 */
export function activateCdkLsp(context: vscode.ExtensionContext): void {
    // CodeLens command the server emits (OPEN_RESOURCE_COMMAND in cdk-explorer):
    // open a synthesized-template resource, or a picker when several share a line.
    context.subscriptions.push(vscode.commands.registerCommand('cdkExplorer.openResource', openResourceCommand), {
        dispose: () => void stopClient(),
    })

    // Re-resolve on the events that can change which app dir (if any) we serve,
    // so the server starts/stops without a window reload.
    const cdkJsonWatcher = vscode.workspace.createFileSystemWatcher('**/cdk.json')
    context.subscriptions.push(
        cdkJsonWatcher,
        cdkJsonWatcher.onDidCreate((uri) => {
            // A CDK project appeared where we weren't serving one. Ignore vendored
            // fixtures under node_modules.
            if (!client && !uri.fsPath.includes(`${path.sep}node_modules${path.sep}`)) {
                scheduleRestart(context)
            }
        }),
        vscode.workspace.onDidChangeWorkspaceFolders(() => scheduleRestart(context)),
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('aws.cdk.appDir') || e.affectsConfiguration('aws.cdk.cliPath')) {
                scheduleRestart(context)
            }
        })
    )

    scheduleRestart(context)
}

/**
 * Serialize (re)starts into a queue-of-one. Overlapping triggers (activation,
 * config/folder changes, a new cdk.json) must not run two starts concurrently,
 * or the second would overwrite `client` and leak the first. A burst coalesces
 * into at most one trailing restart, which observes the latest state.
 */
function scheduleRestart(context: vscode.ExtensionContext): void {
    if (restartQueued) {
        return
    }
    restartQueued = true
    restartInFlight = restartInFlight.then(() => {
        restartQueued = false
        return restartClient(context)
    })
}

export async function deactivateCdkLsp(): Promise<void> {
    await stopClient()
}

/**
 * The running CDK language server client, if one is started. Exposed so tree
 * features can query server routes (e.g. `cdk/getConstructTree`); undefined when
 * no CDK app is served or the server has not started yet.
 */
export function getCdkLanguageClient(): LanguageClient | undefined {
    return client
}

/** Resolve the single CDK app directory to serve, or undefined to stay off. */
async function resolveAppDir(): Promise<string | undefined> {
    const configured = vscode.workspace.getConfiguration('aws.cdk').get<string>('appDir')?.trim()
    if (configured) {
        return path.isAbsolute(configured)
            ? configured
            : path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '', configured)
    }

    // Activation gate: reuse the explorer's cdk.json detection so we never spawn
    // in a non-CDK workspace.
    const dirs = (await detectCdkProjects()).map((p) => path.dirname(p.cdkJsonUri.fsPath)).sort()
    if (dirs.length === 0) {
        return undefined
    }
    if (dirs.length > 1) {
        notifyOnce(
            'multipleApps',
            `Multiple CDK apps found. Using ${dirs[0]}. Set aws.cdk.appDir to choose a different one.`
        )
    }
    return dirs[0]
}

/** Stop any running client, then (re)resolve and start one for the current app dir. */
async function restartClient(context: vscode.ExtensionContext): Promise<void> {
    await stopClient()
    try {
        const appDir = await resolveAppDir()
        if (!appDir) {
            return
        }

        // Resolve the shell env once; the ladder's PATH rung and the spawn reuse it.
        const env = await buildCdkSpawnEnv()

        const resolved = await resolveCdkCli(appDir, env)
        if (!resolved) {
            notifyOnce(
                'missing',
                `CDK language features need the AWS CDK CLI. Install it (>= ${minimumCdkLspVersion}) or set aws.cdk.cliPath.`
            )
            telemetry.cdk_startLanguageServer.emit({ result: 'Failed', reason: 'cdkCliNotFound' })
            return
        }

        // Version gate: `cdk lsp` only exists on >= minimumCdkLspVersion.
        const version = await probeCdkVersion(resolved.command, env)
        if (!version || !meetsMinimum(version)) {
            logger.info(`cdk at ${resolved.command} is ${version ?? 'unknown'}; need >= ${minimumCdkLspVersion}`)
            notifyOnce(
                'outdated',
                `AWS CDK CLI ${version ?? ''} is too old for language features. Upgrade to >= ${minimumCdkLspVersion}.`
            )
            telemetry.cdk_startLanguageServer.emit({
                result: 'Failed',
                reason: 'cdkCliOutdated',
                cdkCliVersion: version,
            })
            return
        }

        const executable: Executable = {
            command: resolved.command,
            args: ['lsp'],
            transport: TransportKind.stdio,
            options: { cwd: appDir, env },
        }
        const serverOptions: ServerOptions = { run: executable, debug: executable }

        outputChannel = vscode.window.createOutputChannel('CDK Language Server')
        const clientOptions: LanguageClientOptions = {
            // Source-linked features cover TypeScript + jsii host languages, plus
            // synthesized templates for template -> construct go-to-definition.
            documentSelector: [
                { scheme: 'file', language: 'typescript' },
                { scheme: 'file', language: 'python' },
                { scheme: 'file', language: 'java' },
                { scheme: 'file', pattern: '**/*.template.json' },
            ],
            initializationOptions: { applicationDir: appDir },
            outputChannel,
            workspaceFolder: vscode.workspace.getWorkspaceFolder(vscode.Uri.file(appDir)),
        }

        client = new LanguageClient('cdkLsp', 'CDK Language Server', serverOptions, clientOptions)
        // The CDK tree can render before the server is ready to answer
        // cdk/getConstructTree (its source map comes back empty until then), which
        // otherwise forces a manual refresh. Refresh the tree whenever the client
        // reaches Running so source links and template icons appear on their own
        // (also covers reconnects). Guarded: the refresh command may not be
        // registered yet on a very early start.
        client.onDidChangeState((e) => {
            if (e.newState === State.Running) {
                void vscode.commands.executeCommand('aws.cdk.refresh').then(undefined, () => {})
            }
        })
        logger.info(`Starting \`cdk lsp\` for ${appDir} (cdk ${version} via ${resolved.source})`)
        await client.start()
        telemetry.cdk_startLanguageServer.emit({
            result: 'Succeeded',
            cdkCliSource: resolved.source,
            cdkCliVersion: version,
        })
    } catch (err) {
        logger.error(`Failed to start cdk lsp: %O`, err)
        telemetry.cdk_startLanguageServer.emit({ result: 'Failed', reason: 'startError' })
        await stopClient()
    }
}

async function stopClient(): Promise<void> {
    const stopping = client?.stop().catch(() => {})
    client = undefined
    outputChannel?.dispose()
    outputChannel = undefined
    notified.clear()
    await stopping
}

function notifyOnce(kind: string, message: string): void {
    if (notified.has(kind)) {
        return
    }
    notified.add(kind)
    // Non-blocking, dismissible.
    void vscode.window.showInformationMessage(message)
}

/**
 * Handler for the `cdkExplorer.openResource` CodeLens command the server emits.
 * `choices` are QuickPick-shaped resource targets ({ label: CFN type,
 * description: construct name, target: { uri, range } }).
 */
async function openResourceCommand(
    choices: Array<{
        label: string
        description: string
        target: {
            uri: string
            range: { start: { line: number; character: number }; end: { line: number; character: number } }
        }
    }>
): Promise<void> {
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
    const { uri, range } = chosen.target
    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri))
    const editor = await vscode.window.showTextDocument(document)
    const start = new vscode.Position(range.start.line, range.start.character)
    const end = new vscode.Position(range.end.line, range.end.character)
    editor.selection = new vscode.Selection(start, end)
    editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenter)
}
