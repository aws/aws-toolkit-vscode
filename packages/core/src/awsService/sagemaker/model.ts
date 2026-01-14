/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Disabled: detached server files cannot import vscode.
/* eslint-disable no-restricted-imports */
import * as vscode from 'vscode'
import { getSshConfigPath, sshAgentSocketVariable, startSshAgent, startVscodeRemote } from '../../shared/extensions/ssh'
import { createBoundProcess, ensureDependencies } from '../../shared/remoteSession'
import { SshConfig } from '../../shared/sshConfig'
import { Result } from '../../shared/utilities/result'
import * as path from 'path'
import { persistLocalCredentials, persistSmusProjectCreds, persistSSMConnection } from './credentialMapping'
import * as os from 'os'
import _ from 'lodash'
import { fs } from '../../shared/fs/fs'
import * as nodefs from 'fs'
import { getSmSsmEnv, spawnDetachedServer } from './utils'
import { getLogger } from '../../shared/logger/logger'
import { DevSettings } from '../../shared/settings'
import { ToolkitError } from '../../shared/errors'
import { SagemakerSpaceNode } from './explorer/sagemakerSpaceNode'
import { sleep } from '../../shared/utilities/timeoutUtils'
import { SagemakerUnifiedStudioSpaceNode } from '../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioSpaceNode'
import { SshConfigError, SshConfigErrorMessage } from './constants'
import globals from '../../shared/extensionGlobals'

const logger = getLogger('sagemaker')

class HyperPodSshConfig extends SshConfig {
    constructor(
        sshPath: string,
        private readonly hyperpodConnectPath: string
    ) {
        super(sshPath, 'hp_', 'hyperpod_connect')
    }

    protected override createSSHConfigSection(proxyCommand: string): string {
        return `
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host hp_*
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand '${this.hyperpodConnectPath}' '%h'
    IdentitiesOnly yes
`
    }

    public override async ensureValid() {
        const proxyCommand = `'${this.hyperpodConnectPath}' '%h'`
        const verifyHost = await this.verifySSHHost(proxyCommand)
        if (verifyHost.isErr()) {
            return verifyHost
        }
        return Result.ok()
    }
}

export async function tryRemoteConnection(
    node: SagemakerSpaceNode | SagemakerUnifiedStudioSpaceNode,
    ctx: vscode.ExtensionContext,
    progress: vscode.Progress<{ message?: string; increment?: number }>
) {
    const spaceArn = (await node.getSpaceArn()) as string
    const isSMUS = node instanceof SagemakerUnifiedStudioSpaceNode
    const remoteEnv = await prepareDevEnvConnection(spaceArn, ctx, 'sm_lc', isSMUS, node)
    try {
        progress.report({ message: 'Opening remote session' })
        await startVscodeRemote(
            remoteEnv.SessionProcess,
            remoteEnv.hostname,
            '/home/sagemaker-user',
            remoteEnv.vscPath,
            'sagemaker-user'
        )
    } catch (err) {
        getLogger().info(
            `sm:OpenRemoteConnect: Unable to connect to target space with arn: ${await node.getAppArn()} error: ${err}`
        )
    }
}

export function extractRegionFromStreamUrl(streamUrl: string): string {
    const url = new URL(streamUrl)
    const match = url.hostname.match(/^[^.]+\.([^.]+)\.amazonaws\.com$/)
    if (!match) {
        throw new Error(`Unable to get region from stream url: ${streamUrl}`)
    }
    return match[1]
}

export async function prepareDevEnvConnection(
    spaceArn: string,
    ctx: vscode.ExtensionContext,
    connectionType: string,
    isSMUS: boolean,
    node: SagemakerSpaceNode | SagemakerUnifiedStudioSpaceNode | undefined,
    session?: string,
    wsUrl?: string,
    token?: string,
    domain?: string,
    appType?: string
) {
    const remoteLogger = configureRemoteConnectionLogger()
    const { ssm, vsc, ssh } = (await ensureDependencies()).unwrap()

    // Check timeout setting for remote SSH connections
    const remoteSshConfig = vscode.workspace.getConfiguration('remote.SSH')
    const current = remoteSshConfig.get<number>('connectTimeout')
    if (typeof current === 'number' && current < 120) {
        await remoteSshConfig.update('connectTimeout', 120, vscode.ConfigurationTarget.Global)
        void vscode.window.showInformationMessage(
            'Updated "remote.SSH.connectTimeout" to 120 seconds to improve stability.'
        )
    }

    const hostnamePrefix = connectionType
    let hostname: string
    if (connectionType === 'sm_hp') {
        hostname = `hp_${session}`
    } else {
        hostname = `${hostnamePrefix}_${spaceArn.replace(/\//g, '__').replace(/:/g, '_._')}`
    }
    // save space credential mapping
    if (connectionType === 'sm_lc') {
        if (!isSMUS) {
            await persistLocalCredentials(spaceArn)
        } else {
            await persistSmusProjectCreds(spaceArn, node as SagemakerUnifiedStudioSpaceNode)
        }
    } else if (connectionType === 'sm_dl') {
        await persistSSMConnection(spaceArn, domain ?? '', session, wsUrl, token, appType, isSMUS)
    }

    // HyperPod doesn't need the local server (only for SageMaker Studio)
    if (connectionType !== 'sm_hp') {
        await startLocalServer(ctx)
    }
    await removeKnownHost(hostname)

    const hyperpodConnectPath = path.join(ctx.globalStorageUri.fsPath, 'hyperpod_connect')

    // Copy hyperpod_connect script if needed
    if (connectionType === 'sm_hp') {
        const sourceScriptPath = ctx.asAbsolutePath('resources/hyperpod_connect')
        if (!(await fs.existsFile(hyperpodConnectPath))) {
            try {
                await fs.copy(sourceScriptPath, hyperpodConnectPath)
                await fs.chmod(hyperpodConnectPath, 0o755)
                logger.info(`Copied hyperpod_connect script to ${hyperpodConnectPath}`)
            } catch (err) {
                logger.error(`Failed to copy hyperpod_connect script: ${err}`)
            }
        }
    }

    const sshConfig =
        connectionType === 'sm_hp'
            ? new HyperPodSshConfig(ssh, hyperpodConnectPath)
            : new SshConfig(ssh, 'sm_', 'sagemaker_connect')
    const config = await sshConfig.ensureValid()
    if (config.isErr()) {
        const err = config.err()
        logger.error(`sagemaker: failed to add ssh config section: ${err.message}`)

        if (err instanceof ToolkitError && err.code === 'SshCheckFailed') {
            const sshConfigPath = getSshConfigPath()
            const openConfigButton = 'Open SSH Config'
            const resp = await vscode.window.showErrorMessage(
                SshConfigErrorMessage(),
                { modal: true, detail: err.message },
                openConfigButton
            )

            if (resp === openConfigButton) {
                void vscode.window.showTextDocument(vscode.Uri.file(sshConfigPath))
            }

            // Throw error to stop the connection flow
            // User is already notified via modal above, downstream handlers check the error code
            throw new ToolkitError('Unable to connect: SSH configuration contains errors', {
                code: SshConfigError,
            })
        }

        const logPrefix = connectionType === 'sm_hp' ? 'hyperpod' : 'sagemaker'
        logger.error(`${logPrefix}: failed to add ssh config section: ${err.message}`)
        throw err
    }

    // set envirionment variables
    const vars: NodeJS.ProcessEnv =
        connectionType === 'sm_hp'
            ? await (async () => {
                  const logFileLocation = path.join(ctx.globalStorageUri.fsPath, 'hyperpod-connection.log')
                  const decodedWsUrl =
                      wsUrl
                          ?.replace(/&#39;/g, "'")
                          .replace(/&quot;/g, '"')
                          .replace(/&amp;/g, '&') || ''
                  const decodedToken =
                      token
                          ?.replace(/&#39;/g, "'")
                          .replace(/&quot;/g, '"')
                          .replace(/&amp;/g, '&') || ''
                  const region = decodedWsUrl ? extractRegionFromStreamUrl(decodedWsUrl) : ''

                  const hyperPodEnv: NodeJS.ProcessEnv = {
                      AWS_REGION: region,
                      SESSION_ID: hostname || '',
                      STREAM_URL: decodedWsUrl,
                      TOKEN: decodedToken,
                      AWS_SSM_CLI: ssm,
                      DEBUG_LOG: '1',
                      LOG_FILE_LOCATION: logFileLocation,
                  }

                  // Add AWS credentials
                  try {
                      const creds = await globals.awsContext.getCredentials()
                      if (creds) {
                          hyperPodEnv.AWS_ACCESS_KEY_ID = creds.accessKeyId
                          hyperPodEnv.AWS_SECRET_ACCESS_KEY = creds.secretAccessKey
                          if (creds.sessionToken) {
                              hyperPodEnv.AWS_SESSION_TOKEN = creds.sessionToken
                          }
                          logger.info('Added AWS credentials to environment')
                      } else {
                          logger.warn('No AWS credentials available for HyperPod connection')
                      }
                  } catch (err) {
                      logger.warn(`Failed to get AWS credentials: ${err}`)
                  }

                  return { ...process.env, ...hyperPodEnv }
              })()
            : getSmSsmEnv(ssm, path.join(ctx.globalStorageUri.fsPath, 'sagemaker-local-server-info.json'))

    logger.info(`connect script logs at ${vars.LOG_FILE_LOCATION}`)

    const envProvider = async () => {
        return { [sshAgentSocketVariable]: await startSshAgent(), ...vars }
    }
    const SessionProcess = createBoundProcess(envProvider).extend({
        onStdout: (data: string) => {
            remoteLogger(data)
            if (connectionType === 'sm_hp') {
                getLogger().info(`[ProxyCommand stdout] ${data}`)
            }
        },
        onStderr: (data: string) => {
            remoteLogger(data)
            if (connectionType === 'sm_hp') {
                getLogger().error(`[ProxyCommand stderr] ${data}`)
            }
        },
        rejectOnErrorCode: true,
    })

    return {
        hostname,
        envProvider,
        sshPath: ssh,
        vscPath: vsc,
        SessionProcess,
    }
}

export function configureRemoteConnectionLogger() {
    const logPrefix = 'sagemaker:'
    const logger = (data: string) => getLogger().info(`${logPrefix}: ${data}`)
    return logger
}

export async function startLocalServer(ctx: vscode.ExtensionContext) {
    const storagePath = ctx.globalStorageUri.fsPath
    const serverPath = ctx.asAbsolutePath(path.join('dist/src/awsService/sagemaker/detached-server/', 'server.js'))
    const outLog = path.join(storagePath, 'sagemaker-local-server.out.log')
    const errLog = path.join(storagePath, 'sagemaker-local-server.err.log')
    const infoFilePath = path.join(storagePath, 'sagemaker-local-server-info.json')

    logger.info(`sagemaker-local-server.*.log at ${storagePath}`)

    const customEndpoint = DevSettings.instance.get('endpoints', {})['sagemaker']

    await stopLocalServer(ctx)

    const child = spawnDetachedServer(process.execPath, [serverPath], {
        cwd: path.dirname(serverPath),
        detached: true,
        stdio: ['ignore', nodefs.openSync(outLog, 'a'), nodefs.openSync(errLog, 'a')],
        env: {
            ...process.env,
            SAGEMAKER_ENDPOINT: customEndpoint,
            SAGEMAKER_LOCAL_SERVER_FILE_PATH: infoFilePath,
        },
    })

    child.unref()

    // Wait for the info file to appear (timeout after 10 seconds)
    const maxRetries = 20
    const delayMs = 500
    for (let i = 0; i < maxRetries; i++) {
        if (await fs.existsFile(infoFilePath)) {
            logger.debug('Detected server info file.')
            return
        }
        await sleep(delayMs)
    }

    throw new ToolkitError(`Timed out waiting for local server info file: ${infoFilePath}`)
}

interface LocalServerInfo {
    pid: number
    port: string
}

export async function stopLocalServer(ctx: vscode.ExtensionContext): Promise<void> {
    const infoFilePath = path.join(ctx.globalStorageUri.fsPath, 'sagemaker-local-server-info.json')

    if (!(await fs.existsFile(infoFilePath))) {
        logger.debug('no server info file found. nothing to stop.')
        return
    }

    let pid: number | undefined
    try {
        const content = await fs.readFileText(infoFilePath)
        const infoJson = JSON.parse(content) as LocalServerInfo
        pid = infoJson.pid
    } catch (err: any) {
        throw ToolkitError.chain(err, 'failed to parse server info file')
    }

    if (typeof pid === 'number' && !isNaN(pid)) {
        try {
            process.kill(pid)
            logger.debug(`stopped local server with PID ${pid}`)
        } catch (err: any) {
            if (err.code === 'ESRCH') {
                logger.warn(`no process found with PID ${pid}. It may have already exited.`)
            } else {
                throw ToolkitError.chain(err, 'failed to stop local server')
            }
        }
    } else {
        logger.warn('no valid PID found in info file.')
    }

    try {
        await fs.delete(infoFilePath)
        logger.debug('removed server info file.')
    } catch (err: any) {
        logger.warn(`could not delete info file: ${err.message ?? err}`)
    }
}

export async function removeKnownHost(hostname: string): Promise<void> {
    const knownHostsPath = path.join(os.homedir(), '.ssh', 'known_hosts')

    if (!(await fs.existsFile(knownHostsPath))) {
        logger.warn(`known_hosts not found at ${knownHostsPath}`)
        return
    }

    let lines: string[]
    try {
        const content = await fs.readFileText(knownHostsPath)
        lines = content.split('\n')
    } catch (err: any) {
        throw ToolkitError.chain(err, 'Failed to read known_hosts file')
    }

    const updatedLines = lines.filter((line) => {
        const entryHostname = line.split(' ')[0].split(',')
        // Hostnames in the known_hosts file seem to be always lowercase, but keeping the case-sensitive check just in
        // case. Originally we were only doing the case-sensitive check which caused users to get a host
        // identification error when reconnecting to a Space after it was restarted.
        return !entryHostname.includes(hostname) && !entryHostname.includes(hostname.toLowerCase())
    })

    if (updatedLines.length !== lines.length) {
        try {
            await fs.writeFile(knownHostsPath, updatedLines.join('\n'), { atomic: true })
            logger.debug(`Removed '${hostname}' from known_hosts`)
        } catch (err: any) {
            throw ToolkitError.chain(err, 'Failed to write updated known_hosts file')
        }
    }
}
