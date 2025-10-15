/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This file contains code originally from https://github.com/jeanp413/open-remote-ssh
 * Original copyright: (c) 2022
 * Originally released under MIT license
 */

import * as cp from 'child_process' // eslint-disable-line no-restricted-imports
import * as path from 'path'
import * as stream from 'stream'
import * as vscode from 'vscode'
import SSHConnection from './sshConnection'
import { findRandomPort } from './common/ports'
import { disposeAll } from './common/disposable'
import { installCodeServer, ServerInstallError } from './serverSetup'
import { waitForMatchingStreamOutput as waitForStreamOutput } from './common/streamUtils'
import { withTimeout } from './common/promiseUtils'

// This mirrors the timeout value that the AWS Toolkit writes into the remote.SSH configuration for VS Code.
const connectTimeoutSeconds = 120

// This is hard-coded rather than imported from the AWS Toolkit core/ package to keep the bundle size low.
const awsToolkitExtensionId = 'amazonwebservices.aws-toolkit-vscode'

export const sagemakerSshKiroAuthority = 'sagemaker-ssh-kiro'

export function getRemoteAuthority(host: string) {
    return `${sagemakerSshKiroAuthority}+${host}`
}

class TunnelInfo implements vscode.Disposable {
    constructor(
        readonly localPort: number,
        readonly remotePortOrSocketPath: number | string,
        private disposables: vscode.Disposable[]
    ) {}

    dispose() {
        disposeAll(this.disposables)
    }
}

export class SageMakerSshKiroResolver implements vscode.RemoteAuthorityResolver, vscode.Disposable {
    private sshConnection?: SSHConnection
    private tunnels: TunnelInfo[] = []
    private proxyCommandProcess?: cp.ChildProcessWithoutNullStreams

    private labelFormatterDisposable?: vscode.Disposable

    constructor(
        readonly context: vscode.ExtensionContext,
        readonly logger: vscode.LogOutputChannel
    ) {}

    resolve(authority: string, context: vscode.RemoteAuthorityResolverContext): Thenable<vscode.ResolverResult> {
        const { hostname: hostname, user } = validateAuthority(authority)

        this.logger.info(`Resolving ssh remote authority '${authority}' (attemp #${context.resolveAttempt})`)

        const awsSagemakerConfig = vscode.workspace.getConfiguration('aws.sagemaker.ssh.kiro')
        const serverDownloadUrlTemplate = awsSagemakerConfig.get<string>('serverDownloadUrlTemplate')
        let defaultExtensions = awsSagemakerConfig.get<string[]>('defaultExtensions', [])

        // Ensure the AWS Toolkit is always installed. In VS Code, this is done by updating the user's
        // `defaultExtensions` setting before connecting, but there is no need to update the user's setting if we are
        // going to make sure it's installed every time.
        if (!defaultExtensions.includes(awsToolkitExtensionId)) {
            defaultExtensions = [...defaultExtensions, awsToolkitExtensionId]
        }

        const awsToolkitGlobalStoragePath = this.context.globalStorageUri.fsPath.replace(
            path.basename(this.context.globalStorageUri.fsPath),
            awsToolkitExtensionId
        )

        const isWindows = process.platform === 'win32'
        const scriptName = `sagemaker_connect${isWindows ? '.ps1' : ''}`
        const sagemakerConnectPath = path.join(awsToolkitGlobalStoragePath, scriptName)
        const proxyArgs = [hostname]

        return vscode.window.withProgress(
            {
                title: `Setting up SSH Host ${hostname}`,
                location: vscode.ProgressLocation.Notification,
                cancellable: false,
            },
            async () => {
                try {
                    // Use the determined sagemaker_connect script with appropriate arguments
                    const command = sagemakerConnectPath

                    let options: cp.SpawnOptions = {
                        env: { ...process.env }, // Inherit environment variables from parent process
                    }

                    if (isWindows && /\.ps1$/.test(command)) {
                        // For PowerShell scripts, use powershell.exe
                        const allArgs = ['-ExecutionPolicy', 'RemoteSigned', '-File', command, ...proxyArgs]
                        options = {
                            ...options,
                            windowsHide: true,
                        }

                        this.logger.info(`Spawning SageMaker Connect: powershell.exe ${allArgs.join(' ')}`)
                        this.proxyCommandProcess = cp.spawn(
                            'powershell.exe',
                            allArgs,
                            options
                        ) as cp.ChildProcessWithoutNullStreams
                    } else {
                        this.logger.info(`Spawning SageMaker Connect: ${command} with args: [${proxyArgs.join(',')}]`)
                        this.proxyCommandProcess = cp.spawn(
                            command,
                            proxyArgs,
                            options
                        ) as cp.ChildProcessWithoutNullStreams
                    }

                    if (!this.proxyCommandProcess.stdout || !this.proxyCommandProcess.stdin) {
                        throw new Error('Failed to create proxy command process streams')
                    }

                    // Monitor stderr for errors while spinning sagemaker_connect script
                    this.proxyCommandProcess.stderr.on('data', (data) => {
                        const errorText = data.toString()
                        this.logger.info(`SageMaker Connect stderr: ${errorText}`)
                    })

                    if (isWindows) {
                        // For Windows, we have to wait until the SSM session provides an appropriate ready signal,
                        // or else the SSH2 client handshake will fail for some unknown reason.
                        this.logger.info('Waiting for SSM session to be ready...')
                        const readySignals = ['Starting session with SessionId:', 'SSH-2.0-Go']

                        try {
                            await withTimeout(
                                waitForStreamOutput(this.proxyCommandProcess.stdout, (data: Buffer) => {
                                    const output = data.toString()
                                    // The stderr 'data' callback doesn't emit on Windows for some reason (possibly due to the way the sagemaker_connect
                                    // powershell script is written), so logging stdout is the only way to see what is happening.
                                    this.logger.info(`SageMaker Connect output: ${output}`)

                                    for (const signal of readySignals) {
                                        if (output.includes(signal)) {
                                            this.logger.info(`Tunnel ready signal detected: [${signal}]`)
                                            return true
                                        }
                                    }

                                    return false
                                }),
                                30_000
                            )
                        } catch (error: unknown) {
                            const errorMessage = `Failed to establish SSM session: ${error}`
                            this.logger.error(errorMessage)
                            throw new Error(errorMessage)
                        }
                    }

                    const proxyStream = stream.Duplex.from({
                        readable: this.proxyCommandProcess.stdout,
                        writable: this.proxyCommandProcess.stdin,
                    })

                    // Authentication is handled by AWS SSM Session Manager
                    this.sshConnection = new SSHConnection({
                        sock: proxyStream,
                        username: user,
                        readyTimeout: connectTimeoutSeconds * 1000,
                    })
                    await this.sshConnection.connect()

                    const installResult = await installCodeServer(
                        this.sshConnection,
                        serverDownloadUrlTemplate,
                        defaultExtensions,
                        false
                    )

                    const tunnelConfig = await this.openTunnel(0, installResult.listeningOn)
                    this.tunnels.push(tunnelConfig)

                    this.labelFormatterDisposable?.dispose()
                    this.labelFormatterDisposable = vscode.workspace.registerResourceLabelFormatter({
                        scheme: 'vscode-remote',
                        authority: `${sagemakerSshKiroAuthority}+*`,
                        formatting: {
                            label: '${path}',
                            separator: '/',
                            tildify: true,
                            workspaceSuffix: `SageMaker: ${hostname}`,
                        },
                    })

                    const resolvedResult: vscode.ResolverResult = new vscode.ResolvedAuthority(
                        '127.0.0.1',
                        tunnelConfig.localPort,
                        installResult.connectionToken
                    )
                    return resolvedResult
                } catch (e: unknown) {
                    this.logger.error(`Error resolving authority`, e)

                    // Initial connection
                    if (context.resolveAttempt === 1) {
                        this.logger.show()

                        const closeRemote = 'Close Remote'
                        const retry = 'Retry'
                        const result = await vscode.window.showErrorMessage(
                            `Could not establish connection to "${hostname}"`,
                            { modal: true },
                            closeRemote,
                            retry
                        )

                        if (result === closeRemote) {
                            await vscode.commands.executeCommand('workbench.action.remote.close')
                        } else if (result === retry) {
                            await vscode.commands.executeCommand('workbench.action.reloadWindow')
                        }
                    }

                    if (e instanceof ServerInstallError || !(e instanceof Error)) {
                        throw vscode.RemoteAuthorityResolverError.NotAvailable(
                            e instanceof Error ? e.message : String(e)
                        )
                    } else {
                        throw vscode.RemoteAuthorityResolverError.TemporarilyNotAvailable(e.message)
                    }
                }
            }
        )
    }

    private async openTunnel(localPort: number, remotePortOrSocketPath: number | string) {
        localPort = localPort > 0 ? localPort : await findRandomPort()

        const disposables: vscode.Disposable[] = []
        const remotePort = typeof remotePortOrSocketPath === 'number' ? remotePortOrSocketPath : undefined
        const remoteSocketPath = typeof remotePortOrSocketPath === 'string' ? remotePortOrSocketPath : undefined

        this.logger.info(`Opening tunnel ${localPort}(local) => ${remotePortOrSocketPath}(remote)`)
        const tunnelConfig = await this.sshConnection!.addTunnel({
            name: `ssh_tunnel_${localPort}_${remotePortOrSocketPath}`,
            remoteAddr: '127.0.0.1',
            remotePort,
            remoteSocketPath,
            localPort,
        })
        disposables.push({
            dispose: () => {
                void this.sshConnection?.closeTunnel(tunnelConfig.name)
                this.logger.info(`Tunnel ${tunnelConfig.name} closed`)
            },
        })

        return new TunnelInfo(localPort, remotePortOrSocketPath, disposables)
    }

    dispose() {
        disposeAll(this.tunnels)
        void this.sshConnection?.close()
        this.proxyCommandProcess?.kill()
        this.labelFormatterDisposable?.dispose()
    }
}

export function validateAuthority(authority: string): { hostname: string; user: string } {
    const [type, dest] = authority.split('+')
    if (type !== sagemakerSshKiroAuthority) {
        throw new Error(`Invalid authority type for SageMaker SSH Kiro resolver: ${type}`)
    }

    let hostname = dest
    let user = 'sagemaker-user'
    if (dest.includes('@')) {
        const parts = dest.split('@')

        if (parts.length !== 2) {
            throw new Error(`Invalid connection format: ${dest}. Expected format: [user@]hostname`)
        }

        const providedUser = parts[0].trim()
        hostname = parts[1].trim()

        if (providedUser) {
            if (!/^[a-zA-Z0-9_-]+$/.test(providedUser)) {
                throw new Error(
                    `Invalid username format: ${providedUser}. Username must contain only alphanumeric characters, hyphens, and underscores.`
                )
            }

            user = providedUser
        }
    }

    if (!/^sm_[a-zA-Z0-9\._-]+$/.test(hostname)) {
        throw new Error(`Invalid SageMaker hostname format: ${hostname}. Expected either 'sm_*' format.`)
    }

    return { hostname, user }
}
