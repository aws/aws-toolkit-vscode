/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import glob from 'glob'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import * as manifest from '../../package.json'
import { promisify } from 'util'
import { getLogger } from '../shared/logger'
import { selectCodeCatalystResource } from '../codecatalyst/wizards/selectResource'
import { VSCODE_EXTENSION_ID } from '../shared/extensions'
import { DevEnvironment, CodeCatalystClient } from '../shared/clients/codecatalystClient'
import { prepareDevEnvConnection } from '../codecatalyst/model'
import { ChildProcess } from '../shared/utilities/childProcess'
import { Timeout } from '../shared/utilities/timeoutUtils'
import { CodeCatalystCommands } from '../codecatalyst/commands'
import { showViewLogsMessage } from '../shared/utilities/messages'
import { startVscodeRemote } from '../shared/extensions/ssh'
import { isValidResponse } from '../shared/wizards/wizard'
import { createQuickPick } from '../shared/ui/pickerPrompter'
import { createCommonButtons } from '../shared/ui/buttons'

type LazyProgress<T> = vscode.Progress<T> & vscode.Disposable & { getToken(): Timeout }

/**
 * Progress dialog that does not show until `report()` is called.
 */
function lazyProgress<T extends Record<string, any>>(timeout: Timeout): LazyProgress<T> {
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
                void vscode.window.withProgress({ location, cancellable: true }, (p, t) => {
                    progress = p
                    t.onCancellationRequested(e => timeout.cancel())
                    return thenable
                })
            }
            progress.report(value)
        },
    }
}

export async function openTerminalCommand(ctx: vscode.ExtensionContext) {
    const commands = CodeCatalystCommands.fromContext(ctx)
    const progress = lazyProgress<{ message: string }>(new Timeout(900000))

    await commands.withClient(openTerminal, progress).finally(() => progress.dispose())
}

async function openTerminal(client: CodeCatalystClient, progress: LazyProgress<{ message: string }>) {
    const devenv = await selectCodeCatalystResource(client, 'devEnvironment')
    if (!devenv) {
        return
    }

    const connection = await prepareDevEnvConnection(client, devenv, {
        topic: 'terminal',
        timeout: progress.getToken(),
    })

    progress.report({ message: 'Opening terminal...' })

    const options: vscode.TerminalOptions = {
        name: `Remote Connection (${devenv.id})`,
        shellPath: connection.sshPath,
        shellArgs: [connection.hostname],
        env: (await connection.envProvider()) as Record<string, string>,
    }

    vscode.window.createTerminal(options).show()
}

export async function installVsixCommand(ctx: vscode.ExtensionContext) {
    const commands = CodeCatalystCommands.fromContext(ctx)

    await commands.withClient(async client => {
        const env = await selectCodeCatalystResource(client, 'devEnvironment')
        if (!env) {
            return
        }
        const progress = lazyProgress<{ message: string }>(new Timeout(900000))

        try {
            await installVsix(ctx, client, progress, env).finally(() => progress.dispose())
        } catch (err) {
            getLogger().error(`installVsixCommand: installation failed: %O`, err)
            void showViewLogsMessage('VSIX installation failed')
        }
    })
}

async function promptVsix(
    ctx: vscode.ExtensionContext,
    progress?: LazyProgress<{ message: string }>
): Promise<vscode.Uri | undefined> {
    const folders = (vscode.workspace.workspaceFolders ?? []).map(f => f.uri).concat(vscode.Uri.file(ctx.extensionPath))

    enum ExtensionMode {
        Production = 1,
        Development = 2,
        Test = 3,
    }

    const isDevelopmentWindow = ctx.extensionMode === ExtensionMode.Development
    const extPath = isDevelopmentWindow ? ctx.extensionPath : folders[0].fsPath

    const packageNew = {
        label: 'Create new VSIX',
        detail: extPath,
        description: 'Important: this currently breaks any running `watch` tasks',
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

/**
 * Bootstrap an environment for remote development/debugging
 */
async function installVsix(
    ctx: vscode.ExtensionContext,
    client: CodeCatalystClient,
    progress: LazyProgress<{ message: string }>,
    env: DevEnvironment
): Promise<void> {
    const resp = await promptVsix(ctx, progress).then(r => r?.fsPath)

    if (!resp) {
        return
    }

    const connection = await prepareDevEnvConnection(client, env, {
        topic: 'install',
        timeout: progress.getToken(),
    })
    const { hostname, vscPath, sshPath, SessionProcess } = connection

    const extId = VSCODE_EXTENSION_ID.awstoolkit
    const extPath = `/home/mde-user/.vscode-server/extensions`
    const userWithHost = `mde-user@${hostname}`

    if (path.extname(resp) !== '.vsix') {
        progress.report({ message: 'Copying extension...' })

        const packageData = await fs.readFile(path.join(resp, 'package.json'), 'utf-8')
        const targetManfiest: typeof manifest = JSON.parse(packageData)
        const destName = `${extPath}/${extId}-${targetManfiest.version}`
        const source = `${resp}${path.sep}`

        // Using `.vscodeignore` would be nice here but `rsync` doesn't understand glob patterns
        const excludes = ['.git/', 'node_modules/', '/src/', '/scripts/', '/dist/src/test/']
            .map(p => ['--exclude', p])
            .reduce((a, b) => a.concat(b))

        const installCommand = [`cd ${destName}`, 'npm i --ignore-scripts'].join(' && ')

        await new SessionProcess('ssh', [hostname, '-v', `mkdir -p ${destName}`]).run()
        await new SessionProcess('rsync', ['-vr', ...excludes, source, `${userWithHost}:${destName}`]).run()
        await new SessionProcess('ssh', [hostname, '-v', installCommand]).run()
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
        const destName = [extId, ...suffixParts.reverse()].join('-')

        const installCmd = [
            `rm ${extPath}/.obsolete || true`,
            `find ${extPath} -type d -name '${extId}*' -exec rm -rf {} +`,
            `unzip ${remoteVsix} "extension/*" "extension.vsixmanifest" -d ${extPath}`,
            `mv ${extPath}/extension ${extPath}/${destName}`,
            `mv ${extPath}/extension.vsixmanifest ${extPath}/${destName}/.vsixmanifest`,
        ].join(' && ')

        progress.report({ message: 'Installing VSIX...' })
        await new SessionProcess(sshPath, [`${hostname}`, '-v', installCmd]).run()
    }

    progress.report({ message: 'Launching instance...' })
    await startVscodeRemote(SessionProcess, hostname, '/projects', vscPath)
}

export async function deleteDevEnvCommand(ctx: vscode.ExtensionContext) {
    const commands = CodeCatalystCommands.fromContext(ctx)

    await commands.withClient(async client => {
        const devenv = await selectCodeCatalystResource(client, 'devEnvironment')
        if (!devenv) {
            return
        }

        await client.deleteDevEnvironment({
            id: devenv.id,
            projectName: devenv.project.name,
            spaceName: devenv.org.name,
        })
    })
}
