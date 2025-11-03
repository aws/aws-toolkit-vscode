/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Disabled: detached server files cannot import vscode.
/* eslint-disable no-restricted-imports */
import * as vscode from 'vscode'
import { sshAgentSocketVariable, startSshAgent, startVscodeRemote } from '../../shared/extensions/ssh'
import { createBoundProcess, ensureDependencies } from '../../shared/remoteSession'
import { ensureConnectScript, SshConfig } from '../../shared/sshConfig'
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
import { isKiro } from '../../shared/extensionUtilities'
import { getIdeType } from '../../shared/extensionUtilities'
import { ChildProcess } from '../../shared/utilities/processUtils'
import { ensureSageMakerSshKiroExtension } from './sagemakerSshKiroUtils'

const logger = getLogger('sagemaker')

export async function tryRemoteConnection(
    node: SagemakerSpaceNode | SagemakerUnifiedStudioSpaceNode,
    ctx: vscode.ExtensionContext,
    progress: vscode.Progress<{ message?: string; increment?: number }>
) {
    if (useSageMakerSshKiroExtension()) {
        await ensureSageMakerSshKiroExtension(ctx)
    }

    const path = '/home/sagemaker-user'
    const username = 'sagemaker-user'
    const spaceArn = (await node.getSpaceArn()) as string
    const isSMUS = node instanceof SagemakerUnifiedStudioSpaceNode
    const remoteEnv = await prepareDevEnvConnection(spaceArn, ctx, 'sm_lc', isSMUS, node)

    try {
        if (useSageMakerSshKiroExtension()) {
            await startRemoteViaSageMakerSshKiro(
                remoteEnv.SessionProcess,
                remoteEnv.hostname,
                path,
                remoteEnv.vscPath,
                username
            )
        } else {
            await startVscodeRemote(remoteEnv.SessionProcess, remoteEnv.hostname, path, remoteEnv.vscPath, username)
        }
    } catch (err) {
        getLogger().info(
            `sm:OpenRemoteConnect: Unable to connect to target space with arn: ${await node.getAppArn()} error: ${err}`
        )
    }
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
    // Skip Remote SSH extension check in Kiro since it uses embedded SageMaker SSH Kiro extension
    const { ssm, vsc, ssh } = (
        await ensureDependencies({ skipRemoteSshCheck: useSageMakerSshKiroExtension() })
    ).unwrap()

    if (!useSageMakerSshKiroExtension()) {
        // Check timeout setting for remote SSH connections
        const remoteSshConfig = vscode.workspace.getConfiguration('remote.SSH')
        const current = remoteSshConfig.get<number>('connectTimeout')
        if (typeof current === 'number' && current < 120) {
            await remoteSshConfig.update('connectTimeout', 120, vscode.ConfigurationTarget.Global)
            void vscode.window.showInformationMessage(
                'Updated "remote.SSH.connectTimeout" to 120 seconds to improve stability.'
            )
        }
    }

    const hostnamePrefix = connectionType
    const hostname = `${hostnamePrefix}_${spaceArn.replace(/\//g, '__').replace(/:/g, '_._')}`

    // save space credential mapping
    if (connectionType === 'sm_lc') {
        if (!isSMUS) {
            await persistLocalCredentials(spaceArn)
        } else {
            await persistSmusProjectCreds(spaceArn, node as SagemakerUnifiedStudioSpaceNode)
        }
    } else if (connectionType === 'sm_dl') {
        await persistSSMConnection(spaceArn, domain ?? '', session, wsUrl, token, appType)
    }

    await startLocalServer(ctx)

    if (useSageMakerSshKiroExtension()) {
        // Skip SSH Config and known host changes when using the SageMaker SSH
        // Kiro uses the embedded SageMaker SSH Kiro extension which handles SSH connections differently
        const scriptResult = await ensureConnectScript('sagemaker_connect')
        if (scriptResult.isErr()) {
            throw scriptResult
        }
    } else {
        await removeKnownHost(hostname)

        const sshConfig = new SshConfig(ssh, 'sm_', 'sagemaker_connect')
        const config = await sshConfig.ensureValid()
        if (config.isErr()) {
            const err = config.err()
            logger.error(`failed to add ssh config section: ${err.message}`)
            throw err
        }
    }

    // set envirionment variables
    const vars = getSmSsmEnv(ssm, path.join(ctx.globalStorageUri.fsPath, 'sagemaker-local-server-info.json'))
    logger.info(`connect script logs at ${vars.LOG_FILE_LOCATION}`)

    const envProvider = async () => {
        return { [sshAgentSocketVariable]: await startSshAgent(), ...vars }
    }
    const SessionProcess = createBoundProcess(envProvider).extend({
        onStdout: remoteLogger,
        onStderr: remoteLogger,
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
            PARENT_IDE_TYPE: getIdeType(),
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

export function useSageMakerSshKiroExtension(): boolean {
    return isKiro()
}

export async function startRemoteViaSageMakerSshKiro(
    ProcessClass: typeof ChildProcess,
    hostname: string,
    targetDirectory: string,
    vscPath: string,
    user?: string
): Promise<void> {
    const userAt = user ? `${user}@` : ''
    const workspaceUri = `vscode-remote://sagemaker-ssh-kiro+${userAt}${hostname}${targetDirectory}`
    await new ProcessClass(vscPath, ['--folder-uri', workspaceUri]).run()
}
