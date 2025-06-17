/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolkitError } from '../../errors'
import { Logger } from '../../logger/logger'
import { ChildProcess } from '../../utilities/processUtils'
import { waitUntil } from '../../utilities/timeoutUtils'
import { isDebugInstance } from '../../vscode/env'
import * as vscode from 'vscode'

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

/**
 * Gets proxy settings from VS Code configuration
 */
export function getVSCodeProxySettings(): { proxyUrl?: string; proxyBypassRules?: string; certificatePath?: string } {
    try {
        const result: { proxyUrl?: string; proxyBypassRules?: string; certificatePath?: string } = {}

        // Get proxy settings from VS Code configuration
        const httpConfig = vscode.workspace.getConfiguration('http')
        const proxy = httpConfig.get<string>('proxy')

        if (proxy) {
            result.proxyUrl = proxy
        }

        // Try to get system certificates
        try {
            // @ts-ignore - This is a valid access pattern in VSCode extensions
            const electron = require('electron')
            if (electron?.net?.getCACertificates) {
                const certs = electron.net.getCACertificates()
                if (certs && certs.length > 0) {
                    // Create a temporary file with the certificates
                    const os = require('os')
                    const fs = require('fs')
                    const path = require('path')

                    const certContent = certs
                        .map((cert: any) => cert.pemEncoded)
                        .filter(Boolean)
                        .join('\\n')

                    if (certContent) {
                        const tempDir = path.join(os.tmpdir(), 'aws-toolkit-vscode')
                        if (!fs.existsSync(tempDir)) {
                            fs.mkdirSync(tempDir, { recursive: true })
                        }

                        const certPath = path.join(tempDir, 'vscode-ca-certs.pem')
                        fs.writeFileSync(certPath, certContent)
                        result.certificatePath = certPath
                    }
                }
            }
        } catch (err) {
            // Silently fail if we can't access certificates
        }

        return result
    } catch (err) {
        // Silently fail if we can't access VS Code configuration
        return {}
    }
}

export function createServerOptions({
    encryptionKey,
    executable,
    serverModule,
    execArgv,
    warnThresholds,
    env,
}: {
    encryptionKey: Buffer
    executable: string[]
    serverModule: string
    execArgv: string[]
    warnThresholds?: { cpu?: number; memory?: number }
    env?: Record<string, string>
}) {
    return async () => {
        const bin = executable[0]
        const args = [...executable.slice(1), serverModule, ...execArgv]
        if (isDebugInstance()) {
            args.unshift('--inspect=6080')
        }

        // Merge environment variables
        const processEnv = { ...process.env }
        if (env) {
            Object.assign(processEnv, env)
        }

        // Get proxy settings from VS Code
        const proxySettings = getVSCodeProxySettings()

        // Add proxy settings to the Node.js process
        if (proxySettings.proxyUrl) {
            processEnv.HTTPS_PROXY = proxySettings.proxyUrl
            processEnv.HTTP_PROXY = proxySettings.proxyUrl
            processEnv.https_proxy = proxySettings.proxyUrl
            processEnv.http_proxy = proxySettings.proxyUrl
        }

        // Add certificate path if available
        if (proxySettings.certificatePath) {
            processEnv.NODE_EXTRA_CA_CERTS = proxySettings.certificatePath
        }

        // Enable Node.js to use system CA certificates as a fallback
        if (!processEnv.NODE_EXTRA_CA_CERTS) {
            processEnv.NODE_TLS_USE_SYSTEM_CA_STORE = '1'
        }

        // Get SSL verification settings
        const httpConfig = vscode.workspace.getConfiguration('http')
        const strictSSL = httpConfig.get<boolean>('proxyStrictSSL', true)

        // Handle SSL certificate verification
        if (!strictSSL) {
            processEnv.NODE_TLS_REJECT_UNAUTHORIZED = '0'
        }

        const lspProcess = new ChildProcess(bin, args, {
            warnThresholds,
            spawnOptions: {
                env: processEnv,
            },
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
