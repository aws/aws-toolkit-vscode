/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolkitError } from '../../errors'
import { ChildProcess } from '../../utilities/processUtils'
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
