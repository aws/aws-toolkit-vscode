/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/*!
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 */
import * as path from 'path'
import { createConnection, InitializeParams, InitializeResult, ServerCapabilities } from 'vscode-languageserver/node'
import { ProposedFeatures } from 'vscode-languageserver/node'
import { IndexRequest, IndexRequestType } from './types'

export function formatError(message: string, err: any): string {
    if (err instanceof Error) {
        const error = <Error>err

        return `${message}: ${error.message}\n${error.stack}`
    } else if (typeof err === 'string') {
        return `${message}: ${err}`
    } else if (err) {
        return `${message}: ${err.toString()}`
    }

    return message
}

// Create a connection for the server
const connection = createConnection(ProposedFeatures.all)
process.on('unhandledRejection', (e: any) => {
    console.error(formatError('Unhandled exception', e))
})
process.on('uncaughtException', (e: any) => {
    console.error(formatError('Unhandled exception', e))
})

console.log = connection.console.log.bind(connection.console)
console.error = connection.console.error.bind(connection.console)

// After the server has started the client sends an initialize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities.
connection.onInitialize((params: InitializeParams): InitializeResult => {
    const capabilities: ServerCapabilities = {}
    return { capabilities }
})

connection.onRequest(IndexRequestType, async (r: IndexRequest) => {
    const e = require('./dist/extension.js')
    console.log(__dirname)
    const modelPath = __dirname
    const lib = await e.start(modelPath)
    await lib.indexFiles([r], '', false)
    console.log(`index done`)
    return ''
})

connection.onShutdown(() => {})

// Listen on the connection
connection.listen()

// copy this qserver folder to ~/.vscode/extensions/qserver
/**
 * qserver---
 *  .out/
 *     ./dist
 *           ./bin
 *           ./build
 *           ./extension.js
 *     ./models
 *     ./lspServer.js
 *
 */

// also copy the dist/extension.js with model to qserver folder
// also copy models to
