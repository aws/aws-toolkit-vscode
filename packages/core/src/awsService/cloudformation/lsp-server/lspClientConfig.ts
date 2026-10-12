/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import { ServerOptions, TextDocumentFilter, TransportKind } from 'vscode-languageclient/node'

/**
 * Documents the CloudFormation language server is attached to: the file extensions templates are commonly saved
 * with (`yaml`, `yml`, `json`, `template`, `cfn`, `txt`) plus the VS Code language ids those files are commonly
 * opened with.
 */
export const CfnDocumentSelector: TextDocumentFilter[] = [
    { scheme: 'file', language: 'plaintext' },
    { scheme: 'file', language: 'cloudformation' },
    { scheme: 'file', language: 'template' },
    { scheme: 'file', language: 'json' },
    { scheme: 'file', language: 'yaml' },
    { scheme: 'file', pattern: '**/*.txt' },
    { scheme: 'file', pattern: '**/*.template' },
    { scheme: 'file', pattern: '**/*.cfn' },
    { scheme: 'file', pattern: '**/*.json' },
    { scheme: 'file', pattern: '**/*.yaml' },
    { scheme: 'file', pattern: '**/*.yml' },
]

const serverEnvironment = {
    NODE_OPTIONS: '--enable-source-maps',
}

/**
 * Launches the server bundle on the extension host's own Node over IPC, from the bundle's directory.
 *
 * Running from that directory gives the server a stable, predictable working directory regardless of which
 * workspace is open. The server locates its bundled assets via `__dirname` and spawns cfn-lint with an explicit
 * `cwd`, so this is a consistency guarantee rather than a functional requirement.
 */
export function cfnServerOptions(serverPath: string): ServerOptions {
    const serverDirectory = path.dirname(serverPath)
    return {
        run: {
            module: serverPath,
            transport: TransportKind.ipc,
            options: {
                cwd: serverDirectory,
                env: serverEnvironment,
            },
        },
        debug: {
            module: serverPath,
            transport: TransportKind.ipc,
            options: {
                cwd: serverDirectory,
                execArgv: ['--no-lazy'],
                env: serverEnvironment,
            },
        },
    }
}
