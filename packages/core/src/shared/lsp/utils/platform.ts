/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolkitError } from '../../errors'
import { Logger } from '../../logger/logger'
import { ChildProcess } from '../../utilities/processUtils'
import { waitUntil } from '../../utilities/timeoutUtils'
import { isDebugInstance } from '../../vscode/env'

export function getNodeExecutableName(): string {
    return process.platform === 'win32' ? 'node.exe' : 'node'
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
export async function validateNodeExe(nodePath: string, lsp: string, args: string[], logger: Logger) {
    // Check that we can start `node` by itself.
    const proc = new ChildProcess(nodePath, ['-e', 'console.log("ok " + process.version)'], { logging: 'no' })
    const r = await proc.run()
    const ok = r.exitCode === 0 && r.stdout.includes('ok')
    if (!ok) {
        const msg = `failed to run basic "node -e" test (exitcode=${r.exitCode}): ${proc.toString(false, true)}`
        logger.error(msg)
        throw new ToolkitError(`amazonqLsp: ${msg}`)
    }

    // Check that we can start `node …/lsp.js --stdio …`.
    const lspProc = new ChildProcess(nodePath, [lsp, ...args])

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
                `amazonqLsp: failed to run (exitcode=${lspProc.exitCode()}): ${lspProc.toString(false, true)}`
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
}: {
    encryptionKey: Buffer
    executable: string
    serverModule: string
    execArgv: string[]
}) {
    return async () => {
        const args = [serverModule, ...execArgv]
        if (isDebugInstance()) {
            args.unshift('--inspect=6080')
        }
        const lspProcess = new ChildProcess(executable, args)
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
