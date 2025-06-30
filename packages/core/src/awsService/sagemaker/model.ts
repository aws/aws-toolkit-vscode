/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Disabled: detached server files cannot import vscode.
/* eslint-disable no-restricted-imports */
import * as vscode from 'vscode'
import { sshAgentSocketVariable, startSshAgent, startVscodeRemote } from '../../shared/extensions/ssh'
import { createBoundProcess, ensureDependencies } from '../../shared/remoteSession'
import { SshConfig } from '../../shared/sshConfig'
import * as path from 'path'
import { persistLocalCredentials, persistSSMConnection } from './credentialMapping'
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

const logger = getLogger('sagemaker')

export async function tryRemoteConnection(node: SagemakerSpaceNode, ctx: vscode.ExtensionContext) {
    const spaceArn = (await node.getSpaceArn()) as string
    const remoteEnv = await prepareDevEnvConnection(spaceArn, ctx, 'sm_lc')

    try {
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

export async function prepareDevEnvConnection(
    appArn: string,
    ctx: vscode.ExtensionContext,
    connectionType: string,
    session?: string,
    wsUrl?: string,
    token?: string,
    domain?: string
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
    const hostname = `${hostnamePrefix}_${appArn.replace(/\//g, '__').replace(/:/g, '_._')}`

    // save space credential mapping
    if (connectionType === 'sm_lc') {
        await persistLocalCredentials(appArn)
    } else if (connectionType === 'sm_dl') {
        await persistSSMConnection(appArn, domain ?? '', session, wsUrl, token)
    }

    await startLocalServer(ctx)
    await removeKnownHost(hostname)

    const sshConfig = new SshConfig(ssh, 'sm_', 'sagemaker_connect')
    const config = await sshConfig.ensureValid()
    if (config.isErr()) {
        const err = config.err()
        logger.error(`sagemaker: failed to add ssh config section: ${err.message}`)
        throw err
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

    logger.info(`local server logs at ${storagePath}/sagemaker-local-server.*.log`)

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

    const updatedLines = lines.filter((line) => !line.split(' ')[0].split(',').includes(hostname))

    if (updatedLines.length !== lines.length) {
        try {
            await fs.writeFile(knownHostsPath, updatedLines.join('\n'), { atomic: true })
            logger.debug(`Removed '${hostname}' from known_hosts`)
        } catch (err: any) {
            throw ToolkitError.chain(err, 'Failed to write updated known_hosts file')
        }
    }
}
