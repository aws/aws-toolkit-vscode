/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Disabled: detached server files cannot import vscode.
/* eslint-disable no-restricted-imports */
import * as vscode from 'vscode'
import { getSshConfigPath, sshAgentSocketVariable, startSshAgent, startVscodeRemote } from '../../shared/extensions/ssh'
import { createBoundProcess, ensureDependencies } from '../../shared/remoteSession'
import { ensureConnectScript, SshConfig } from '../../shared/sshConfig'
import * as path from 'path'
import { persistLocalCredentials, persistSmusProjectCreds, persistSSMConnection } from './credentialMapping'
import _ from 'lodash'
import { fs } from '../../shared/fs/fs'
import * as nodefs from 'fs'
import { getSmSsmEnv, removeKnownHost, spawnDetachedServer } from './utils'
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
import { SshConfigError, SshConfigErrorMessage } from './constants'
import globals from '../../shared/extensionGlobals'
import { createConnectionKey, storeHyperpodConnection } from './detached-server/hyperpodMappingUtils'

const logger = getLogger('sagemaker')

const ideSuffix: Record<string, string> = {
    vscode: '',
    cursor: 'c',
}

export function isValidSshHostname(label: string): boolean {
    return /^[a-z0-9]([a-z0-9.-_]{0,251}[a-z0-9])?$/.test(label)
}

export function createValidSshSession(
    workspaceName: string,
    namespace: string,
    clusterName: string,
    region: string,
    accountId: string
): string {
    const sanitize = (str: string, maxLength: number): string =>
        str
            .toLowerCase()
            .replace(/[^a-z0-9.-]/g, '')
            .replace(/^-+|-+$/g, '')
            .substring(0, maxLength)

    const components = [
        sanitize(workspaceName, 63),
        sanitize(namespace, 63),
        sanitize(clusterName, 100),
        sanitize(region, 16),
        sanitize(accountId, 12),
    ].filter((c) => c.length > 0)

    return components.join('_').substring(0, 253)
}

/** Returns the SSH prefix for a connection type, e.g. 'sm_', 'smc_', 'smhp_' */
export function getSshPrefix(connectionType: string): string {
    if (connectionType === 'sm_hp') {
        return 'smhp_'
    }
    const suffix = ideSuffix[getIdeType()] ?? ''
    return `sm${suffix}_`
}

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
    const remoteEnv = await prepareDevEnvConnection({ spaceArn, ctx, connectionType: 'sm_lc', isSMUS, node })

    try {
        progress.report({ message: 'Opening remote session' })
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

export function extractRegionFromStreamUrl(streamUrl: string): string {
    const url = new URL(streamUrl)
    const match = url.hostname.match(/^[^.]+\.([^.]+)\.amazonaws\.com$/)
    if (!match) {
        throw new Error(`Unable to get region from stream url: ${streamUrl}`)
    }
    return match[1]
}

export interface DevEnvConnectionOptions {
    spaceArn: string
    ctx: vscode.ExtensionContext
    connectionType: string
    isSMUS: boolean
    node?: SagemakerSpaceNode | SagemakerUnifiedStudioSpaceNode
    session?: string
    wsUrl?: string
    token?: string
    domain?: string
    appType?: string
    workspaceName?: string
    clusterName?: string
    namespace?: string
    region?: string
    clusterArn?: string
    accountId?: string
    eksEndpoint?: string
    eksCertAuthData?: string
}

export async function prepareDevEnvConnection(opts: DevEnvConnectionOptions) {
    const {
        spaceArn,
        ctx,
        connectionType,
        isSMUS,
        node,
        session,
        wsUrl,
        token,
        domain,
        appType,
        workspaceName,
        clusterName,
        namespace,
        region,
        clusterArn,
        accountId,
        eksEndpoint,
        eksCertAuthData,
    } = opts
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

    const sshPrefix = getSshPrefix(connectionType)
    let hostname: string
    if (connectionType === 'sm_hp') {
        // Always construct hostname from workspace components for a meaningful window title.
        // The `session` param is the SSM sessionId (e.g. "eks-sagemaker-jupyter"), not a hostname.
        let hpSession: string | undefined
        if (workspaceName && namespace && clusterName && region && accountId) {
            const proposedSession = `${workspaceName}_${namespace}_${clusterName}_${region}_${accountId}`
            hpSession = isValidSshHostname(proposedSession)
                ? proposedSession
                : createValidSshSession(workspaceName, namespace, clusterName, region, accountId)
        }
        if (!hpSession) {
            hpSession = session || 'hyperpod'
        }
        hostname = `${sshPrefix}${hpSession}`
    } else {
        const credsType = connectionType.replace('sm_', '')
        hostname = `${sshPrefix}${credsType}_${spaceArn.replace(/\//g, '__').replace(/:/g, '_._')}`
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

        const sshConfig =
            connectionType === 'sm_hp'
                ? new SshConfig(ssh, sshPrefix, 'hyperpod_connect')
                : new SshConfig(ssh, sshPrefix, 'sagemaker_connect')
        const config = await sshConfig.ensureValid()
        if (config.isErr()) {
            const err = config.err()
            const logPrefix = connectionType === 'sm_hp' ? 'hyperpod' : 'sagemaker'
            logger.error(`${logPrefix}: failed to add ssh config section: ${err.message}`)

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

            throw err
        }
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

                  // Parse presigned URL to extract STREAM_URL, TOKEN, and SESSION_ID
                  let streamUrl = decodedWsUrl
                  let sessionToken = decodedToken
                  let sessionId = hostname || ''

                  if (decodedWsUrl && !decodedToken) {
                      try {
                          const parsedUrl = new URL(decodedWsUrl)
                          const params = parsedUrl.searchParams
                          // Extract from query params (vscode:// redirect URL format)
                          const qStreamUrl = params.get('streamUrl')
                          const qSessionToken = params.get('sessionToken')
                          const qSessionId = params.get('sessionId')
                          if (qStreamUrl) {
                              streamUrl = qStreamUrl
                              sessionToken = qSessionToken || ''
                              sessionId = qSessionId || sessionId
                          } else if (decodedWsUrl.startsWith('wss://')) {
                              // Direct wss:// presigned URL format
                              const pathParts = parsedUrl.pathname.split('/')
                              sessionId = pathParts[pathParts.length - 1] || sessionId
                              sessionToken = params.get('cell-number') || ''
                              streamUrl = decodedWsUrl
                          }
                      } catch (e) {
                          logger.warn(`Failed to parse connection URL: ${e}`)
                      }
                  }

                  const region = streamUrl ? extractRegionFromStreamUrl(streamUrl) : ''

                  const hyperPodEnv: NodeJS.ProcessEnv = {
                      AWS_REGION: region,
                      SESSION_ID: sessionId,
                      STREAM_URL: streamUrl,
                      TOKEN: sessionToken,
                      AWS_SSM_CLI: ssm,
                      DEBUG_LOG: '1',
                      LOG_FILE_LOCATION: logFileLocation,
                      SAGEMAKER_LOCAL_SERVER_FILE_PATH: path.join(
                          ctx.globalStorageUri.fsPath,
                          'sagemaker-local-server-info.json'
                      ),
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
        onStdout: (data: string) => remoteLogger(data),
        onStderr: (data: string) => remoteLogger(data),
        rejectOnErrorCode: true,
    })

    // Start connection monitoring for HyperPod connections
    if (connectionType === 'sm_hp' && workspaceName && clusterName && namespace) {
        try {
            const connectionKey = createConnectionKey(workspaceName, namespace, clusterName)

            await storeHyperpodConnection(
                workspaceName,
                namespace,
                clusterArn!,
                clusterName,
                eksEndpoint,
                eksCertAuthData,
                region,
                wsUrl,
                token
            )

            getLogger().info(`Started monitoring and reconnection for HyperPod space: ${connectionKey}`)
        } catch (error) {
            getLogger().warn(`Failed to start HyperPod monitoring: ${error}`)
        }
    }

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
