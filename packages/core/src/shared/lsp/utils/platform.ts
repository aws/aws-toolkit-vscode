/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getErrorMsg, ToolkitError } from '../../errors'
import { Logger } from '../../logger/logger'
import { ChildProcess } from '../../utilities/processUtils'
import { waitUntil } from '../../utilities/timeoutUtils'
import { isDebugInstance } from '../../vscode/env'
import { isSageMaker } from '../../extensionUtilities'
import { getLogger } from '../../logger/logger'

interface SagemakerCookie {
    authMode?: 'Sso' | 'Iam'
}

export function getNodeExecutableName(): string {
    return process.platform === 'win32' ? 'node.exe' : 'node'
}

export function getRgExecutableName(): string {
    return process.platform === 'win32' ? 'rg.exe' : 'rg'
}

/**
 * Get a json payload that will be sent to the language server, who is waiting to know what the encryption key is.
 * Code reference: https://github.com/aws/language-servers/blob/7da212185a5da75a72ce49a1a7982983f438651a/client/vscode/src/credentialsActivation.ts#L77
 */
function getEncryptionInit(key: Buffer): string {
    const request = {
        version: '1.0',
        mode: 'JWT',
        key: key.toString('base64'),
    }
    return JSON.stringify(request) + '\n'
}

/**
 * Checks that we can actually run the `node` executable and execute code with it.
 */
export async function validateNodeExe(nodePath: string[], lsp: string, args: string[], logger: Logger) {
    const bin = nodePath[0]
    // Check that we can start `node` by itself.
    const proc = new ChildProcess(bin, [...nodePath.slice(1), '-e', 'console.log("ok " + process.version)'], {
        logging: 'no',
    })
    const r = await proc.run()
    const ok = r.exitCode === 0 && r.stdout.includes('ok')
    if (!ok) {
        const msg = `failed to run basic "node -e" test (exitcode=${r.exitCode}): ${proc.toString(false, true)}`
        logger.error(msg)
        throw new ToolkitError(`amazonqLsp: ${msg}`, { code: 'FailedToRunNode' })
    }

    // Check that we can start `node …/lsp.js --stdio …`.
    const lspProc = new ChildProcess(bin, [...nodePath.slice(1), lsp, ...args], { logging: 'no' })
    try {
        // Start asynchronously (it never stops; we need to stop it below).
        lspProc.run().catch((e) => logger.error('failed to run: %s', lspProc.toString(false, true)))

        const ok2 =
            !lspProc.stopped &&
            (await waitUntil(
                async () => {
                    return lspProc.pid() !== undefined
                },
                {
                    timeout: 5000,
                    interval: 100,
                    truthy: true,
                }
            ))
        const selfExit = await waitUntil(async () => lspProc.stopped, {
            timeout: 500,
            interval: 100,
            truthy: true,
        })
        if (!ok2 || selfExit) {
            throw new ToolkitError(
                `amazonqLsp: failed to run (exitcode=${lspProc.exitCode()}): ${lspProc.toString(false, true)}`,
                { code: 'FailedToStartLanguageServer' }
            )
        }
    } finally {
        lspProc.stop(true)
    }
}

export function createServerOptions({
    encryptionKey,
    executable,
    serverModule,
    execArgv,
    warnThresholds,
}: {
    encryptionKey: Buffer
    executable: string[]
    serverModule: string
    execArgv: string[]
    warnThresholds?: { cpu?: number; memory?: number }
}) {
    return async () => {
        const bin = executable[0]
        const args = [...executable.slice(1), '--max-old-space-size=8196', serverModule, ...execArgv]
        if (isDebugInstance()) {
            args.unshift('--inspect=6080')
        }

        // Set USE_IAM_AUTH environment variable for SageMaker environments based on cookie detection
        // This tells the language server to use IAM authentication mode instead of SSO mode
        const env = { ...process.env }

        // eslint-disable-next-line aws-toolkits/no-json-stringify-in-log
        getLogger().debug(`[yueny debug] vars in env: ${JSON.stringify(env)}`)

        if (isSageMaker()) {
            try {
                // The command `sagemaker.parseCookies` is registered in VS Code SageMaker environment
                const result = (await vscode.commands.executeCommand('sagemaker.parseCookies')) as SagemakerCookie
                if (result.authMode !== 'Sso') {
                    env.USE_IAM_AUTH = 'true'
                    getLogger().info(
                        `[SageMaker Debug] Setting USE_IAM_AUTH=true for language server process (authMode: ${result.authMode})`
                    )
                } else {
                    getLogger().info(`[SageMaker Debug] Using SSO auth mode, not setting USE_IAM_AUTH`)
                }
            } catch (err) {
                getLogger().warn(`[SageMaker Debug] Failed to parse SageMaker cookies, defaulting to IAM auth: ${err}`)
                const errMsg = getErrorMsg(err as Error)
                if (errMsg?.includes("command 'sagemaker.parseCookies' not found")) {
                    getLogger().warn('[yueny debug] SageMaker cookies not found, set env.USE_IAM_AUTH as false')
                    env.USE_IAM_AUTH = 'false'
                } else {
                    env.USE_IAM_AUTH = 'true'
                }
            }

            // Log important environment variables for debugging
            getLogger().info(`[SageMaker Debug] Environment variables for language server:`)
            getLogger().info(`[SageMaker Debug] USE_IAM_AUTH: ${env.USE_IAM_AUTH}`)
            getLogger().info(
                `[SageMaker Debug] AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: ${env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI}`
            )
            getLogger().info(`[SageMaker Debug] AWS_DEFAULT_REGION: ${env.AWS_DEFAULT_REGION}`)
            getLogger().info(`[SageMaker Debug] AWS_REGION: ${env.AWS_REGION}`)
        }

        const lspProcess = new ChildProcess(bin, args, {
            warnThresholds,
            spawnOptions: { env },
        })

        // this is a long running process, awaiting it will never resolve
        void lspProcess.run()

        // share an encryption key using stdin
        // follow same practice of DEXP LSP server
        await lspProcess.send(getEncryptionInit(encryptionKey))

        const proc = lspProcess.proc()
        if (!proc) {
            throw new ToolkitError('Language Server process was not started')
        }
        return proc
    }
}
