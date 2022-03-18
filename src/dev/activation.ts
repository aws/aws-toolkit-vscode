/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtContext, VSCODE_EXTENSION_ID } from '../shared/extensions'
import { createCommonButtons } from '../shared/ui/buttons'
import { createQuickPick, DataQuickPickItem } from '../shared/ui/pickerPrompter'
import { isValidResponse, Wizard, WIZARD_RETRY } from '../shared/wizards/wizard'

// CAWS imports
// Planning on splitting this file up.
import { CawsDevEnv, ConnectedCawsClient } from '../shared/clients/cawsClient'
import * as glob from 'glob'
import * as fs from 'fs-extra'
import * as path from 'path'
import { promisify } from 'util'
import * as manifest from '../../package.json'
import { ensureDependencies } from '../mde/mdeModel'
import { getLogger } from '../shared/logger'
import { selectCawsResource } from '../caws/wizards/selectResource'
import { createBoundProcess, createCawsSessionProvider, getHostNameFromEnv } from '../caws/model'
import { ChildProcess } from '../shared/utilities/childProcess'
import { Timeout } from '../shared/utilities/timeoutUtils'
import { createClientFactory } from '../caws/activation'
import { createCommandDecorator } from '../caws/commands'
import { showViewLogsMessage } from '../shared/utilities/messages'

const menuOptions = {
    installVsix: {
        label: 'Install VSIX on Remote Environment',
        description: 'Automatically upload/install a VSIX to a remote host',
        executor: installVsixCommand,
    },
}

function entries<T extends Record<string, U>, U>(obj: T): { [P in keyof T]: [P, T[P]] }[keyof T][] {
    return Object.entries(obj) as { [P in keyof T]: [P, T[P]] }[keyof T][]
}

export function activate(ctx: ExtContext): void {
    async function updateMode(enablement: boolean) {
        await vscode.commands.executeCommand('setContext', 'aws.isDevMode', enablement)
    }

    ctx.extensionContext.subscriptions.push(
        ctx.awsContext.onDidChangeContext(e => updateMode(e.developerMode.size > 0)),
        vscode.commands.registerCommand('aws.dev.openMenu', () => openMenu(ctx, menuOptions))
    )
}

async function openMenu(ctx: ExtContext, options: typeof menuOptions): Promise<void> {
    const OptionWizard = class extends Wizard<{ option: string }> {
        constructor() {
            super()
            this.form.option.bindPrompter(() => {
                return createQuickPick(
                    entries(options).map(([_, v]) => {
                        return {
                            label: v.label,
                            description: v.description,
                            skipEstimate: true,
                            data: async () => {
                                await v.executor(ctx)
                                return WIZARD_RETRY
                            },
                        } as DataQuickPickItem<string>
                    }),
                    {
                        title: 'Developer Menu',
                        buttons: createCommonButtons(),
                    }
                )
            })
        }
    }

    await new OptionWizard().run()
}

type LazyProgress<T> = vscode.Progress<T> & vscode.Disposable & { getToken(): Timeout }

function lazyProgress<T>(timeout: Timeout): LazyProgress<T> {
    let dispose!: () => void
    let progress: vscode.Progress<T>
    const location = vscode.ProgressLocation.Notification
    const thenable = new Promise<void>(resolve => {
        dispose = resolve
        timeout.token.onCancellationRequested(() => resolve)
    })

    return {
        dispose,
        getToken: () => timeout,
        report: value => {
            if (!progress) {
                vscode.window.withProgress({ location, cancellable: true }, (p, t) => {
                    progress = p
                    t.onCancellationRequested(e => timeout.cancel())
                    return thenable
                })
            }
            progress.report(value)
        },
    }
}

async function installVsixCommand(ctx: ExtContext) {
    const factory = createClientFactory(ctx.cawsAuthProvider)
    const decorator = createCommandDecorator(ctx.cawsAuthProvider, factory)

    await decorator(async client => {
        const env = await selectCawsResource(client, 'env')
        if (!env) {
            return
        }
        const progress = lazyProgress<{ message: string }>(new Timeout(900000))

        try {
            await installVsix(ctx, client, progress, env).finally(() => progress.dispose())
        } catch (err) {
            getLogger().error(`installVsixCommand: installation failed: %O`, err)
            showViewLogsMessage('VSIX installation failed')
        }
    })()
}

async function promptVsix(
    ctx: ExtContext,
    progress?: LazyProgress<{ message: string }>
): Promise<vscode.Uri | undefined> {
    const folders = (vscode.workspace.workspaceFolders ?? [])
        .map(f => f.uri)
        .concat(vscode.Uri.file(ctx.extensionContext.extensionPath))

    enum ExtensionMode {
        Production = 1,
        Development = 2,
        Test = 3,
    }

    const withMode = ctx.extensionContext as typeof ctx.extensionContext & { readonly extensionMode: ExtensionMode }
    const extPath =
        withMode.extensionMode === ExtensionMode.Development ? ctx.extensionContext.extensionPath : folders[0].fsPath

    const packageNew = {
        label: 'Create new VSIX',
        detail: extPath,
        skipEstimate: true,
        data: async () => {
            progress?.report({ message: 'Running package script...' })
            const process = new ChildProcess('npm', ['run', 'package', '--', '--no-clean'], {
                spawnOptions: { cwd: extPath },
            })
            const vsixUri = new Promise<vscode.Uri>(async (resolve, reject) => {
                await process
                    .run({
                        timeout: progress?.getToken(),
                        rejectOnErrorCode: true,
                        onStdout(text) {
                            getLogger().info(text, { raw: true })
                            const match = text.match(/VSIX Version: ([\w\-\.]+)/)
                            if (match?.[1]) {
                                try {
                                    resolve(vscode.Uri.file(path.join(extPath, `${manifest.name}-${match[1]}.vsix`)))
                                } catch (e) {
                                    reject(e)
                                }
                            }
                        },
                        onStderr(text) {
                            getLogger().info(text, { raw: true })
                        },
                    })
                    .catch(reject)

                reject(new Error('Did not get VSIX version from "npm run package"'))
            })

            // post package 'clean-up'
            new ChildProcess('npm', ['run', 'buildScripts']).run()

            return vsixUri
        },
    }

    const localInstall = {
        label: 'Use local install (experimental)',
        detail: extPath,
        data: vscode.Uri.file(extPath),
    }

    const seps = [
        { label: 'Scripts', kind: -1, data: {} as any },
        { label: 'Packages', kind: -1, data: {} as any },
    ]
    const items = (async function* () {
        yield [seps.shift()!, packageNew, localInstall]

        for (const f of folders) {
            const paths = await promisify(glob)('*.vsix', { cwd: f.fsPath })
            const uris = paths.map(v => vscode.Uri.file(path.join(f.fsPath, v)))

            if (uris.length > 0 && seps.length > 0) {
                yield [seps.shift()!]
            }

            yield uris.map(v => ({
                label: path.basename(v.fsPath),
                detail: v.fsPath,
                data: v,
            }))
        }
    })()

    const prompter = createQuickPick(items, {
        title: 'Choose a script or VSIX',
        buttons: createCommonButtons(),
    })
    const resp = await prompter.prompt()

    return isValidResponse(resp) ? resp : undefined
}

function logOutput(prefix: string): (data: string) => void {
    return data => getLogger().verbose(`${prefix}: ${data}`)
}

/**
 * Bootstrap an environment for remote development/debugging
 */
async function installVsix(
    ctx: ExtContext,
    client: ConnectedCawsClient,
    progress: LazyProgress<{ message: string }>,
    env: CawsDevEnv
): Promise<void> {
    const resp = await promptVsix(ctx, progress).then(r => r?.fsPath)

    if (!resp) {
        return
    }

    const deps = await ensureDependencies()
    if (!deps) {
        return
    }

    const { vsc, ssh, ssm } = deps

    progress.report({ message: 'Waiting...' })
    const runningEnv = await client.startEnvironmentWithProgress(
        {
            developmentWorkspaceId: env.developmentWorkspaceId,
            organizationName: env.org.name,
            projectName: env.project.name,
        },
        'RUNNING'
    )

    if (!runningEnv) {
        return
    }

    const provider = createCawsSessionProvider(client, 'us-east-1', ssm, ssh)
    const SessionProcess = createBoundProcess(provider, env).extend({
        timeout: progress.getToken(),
        onStdout: logOutput(`install: ${env.id}:`),
        onStderr: logOutput(`install (stderr): ${env.id}:`),
        rejectOnErrorCode: true,
    })

    const hostName = getHostNameFromEnv(env)

    progress.report({ message: 'Starting controller...' })
    await new Promise<void>((resolve, reject) => {
        new SessionProcess(ssh, ['-v', hostName, 'echo "Host Ready"'])
            .run({
                rejectOnErrorCode: true,
                onStdout(text) {
                    if (text.includes('Host Ready')) {
                        resolve()
                    }
                },
            })
            .catch(reject)
    })

    const EXT_ID = VSCODE_EXTENSION_ID.awstoolkit
    const EXT_PATH = `/home/mde-user/.vscode-server/extensions`
    const userWithHost = `mde-user@${hostName}`

    if (path.extname(resp) !== '.vsix') {
        progress.report({ message: 'Copying extension...' })

        const packageData = await fs.readFile(path.join(resp, 'package.json'), 'utf-8')
        const targetManfiest: typeof manifest = JSON.parse(packageData)
        const destName = `${EXT_PATH}/${EXT_ID}-${targetManfiest.version}`
        const source = `${resp}${path.sep}`

        // Using `.vscodeignore` would be nice here but `rsync` doesn't understand glob patterns
        const excludes = ['.git/', 'node_modules/', '/src/', '/scripts/', '/dist/src/test/']
            .map(p => ['--exclude', p])
            .reduce((a, b) => a.concat(b))

        const installCommand = [`cd ${destName}`, 'npm i --ignore-scripts'].join(' && ')

        await new SessionProcess('ssh', [hostName, '-v', `mkdir -p ${destName}`]).run()
        await new SessionProcess('rsync', ['-vr', ...excludes, source, `${userWithHost}:${destName}`]).run()
        await new SessionProcess('ssh', [hostName, '-v', installCommand]).run()
    } else {
        progress.report({ message: 'Copying VSIX...' })
        const remoteVsix = `/projects/${path.basename(resp)}`

        await new SessionProcess('scp', ['-v', resp, `${userWithHost}:${remoteVsix}`]).run()

        const suffixParts = path
            .basename(resp)
            .split('-')
            .reverse()
            .slice(0, 2)
            .map(s => s.replace('.vsix', ''))
        const destName = [EXT_ID, ...suffixParts.reverse()].join('-')
        const installCmd = [
            `mkdir -p ${EXT_PATH}/${destName}`,
            `unzip ${remoteVsix} "extension/*" "extension.vsixmanifest" -d ${EXT_PATH}`,
            `rm -rf ${EXT_PATH}/${destName} || true`,
            `rm -rf ${EXT_PATH}/${destName.split('-').slice(0, -1).join('-')} || true`,
            `mv ${EXT_PATH}/extension ${EXT_PATH}/${destName}`,
            `mv ${EXT_PATH}/extension.vsixmanifest ${EXT_PATH}/${destName}/.vsixmanifest`,
        ].join(' && ')

        progress.report({ message: 'Installing VSIX...' })
        await new SessionProcess(ssh, [`${hostName}`, '-v', installCmd]).run()
    }

    const workspaceUri = `vscode-remote://ssh-remote+${hostName}/projects`
    progress.report({ message: 'Launching instance...' })
    await new SessionProcess(vsc, ['--folder-uri', workspaceUri]).run()
}
