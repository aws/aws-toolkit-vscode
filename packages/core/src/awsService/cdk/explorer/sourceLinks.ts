/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { State } from 'vscode-languageclient/node'
import { getLogger } from '../../../shared/logger/logger'
import { getCdkLanguageClient } from '../lsp/client'

/**
 * Source location of a construct, as resolved by the CDK language server.
 * 1-based line and column, mirroring the server's `cdk/getConstructTree` result.
 */
export interface SourceLocation {
    readonly file: string
    readonly line: number
    readonly column: number
}

// Mirror of cdk-explorer's LSP `cdk/getConstructTree` contract. The Toolkit
// consumes it over the protocol (method + JSON), so it declares matching shapes
// rather than importing across repos.
const getConstructTreeMethod = 'cdk/getConstructTree'

interface ConstructSourceEntry {
    readonly path: string
    readonly sourceLocation?: SourceLocation
    readonly templateFile?: string
    readonly templateOffset?: number
}

interface GetConstructTreeResult {
    readonly status: 'ok' | 'no-assembly'
    readonly entries: readonly ConstructSourceEntry[]
}

/**
 * What the server resolved for one construct: where it was created in source,
 * and/or where its resource lives in the synthesized template. Either half may
 * be absent.
 */
export interface ConstructSourceInfo {
    readonly sourceLocation?: SourceLocation
    readonly templateFile?: string
    readonly templateOffset?: number
}

// The server reads the assembly asynchronously on startup, so getConstructTree
// can briefly return 'no-assembly' right after the client connects. Retry a few
// times before giving up (the client-state refresh in client.ts re-runs this
// once the client reaches Running, so this only bridges the server-side read).
const noAssemblyRetries = 8
const noAssemblyRetryDelayMs = 250

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Ask the running CDK language server to resolve each construct's source
 * location and template target, returned as a map keyed by construct path (the
 * same path tree.json uses). Returns an empty map when the server is not running
 * or the app is not synthesized, so the tree simply renders without links.
 */
export async function fetchConstructSourceMap(): Promise<ReadonlyMap<string, ConstructSourceInfo>> {
    const client = getCdkLanguageClient()
    if (!client || client.state !== State.Running) {
        return new Map()
    }

    try {
        let result = await client.sendRequest<GetConstructTreeResult>(getConstructTreeMethod)
        // We only reach here once tree.json exists, so 'no-assembly' means the
        // server has not finished its initial read yet — a transient startup race.
        for (let attempt = 0; result.status === 'no-assembly' && attempt < noAssemblyRetries; attempt++) {
            await sleep(noAssemblyRetryDelayMs)
            result = await client.sendRequest<GetConstructTreeResult>(getConstructTreeMethod)
        }
        const map = new Map<string, ConstructSourceInfo>()
        for (const entry of result.entries) {
            if (entry.sourceLocation || entry.templateFile) {
                map.set(entry.path, {
                    sourceLocation: entry.sourceLocation,
                    templateFile: entry.templateFile,
                    templateOffset: entry.templateOffset,
                })
            }
        }
        return map
    } catch (err) {
        getLogger('cdkLsp').warn('CDK source links unavailable: %s', (err as Error).message)
        return new Map()
    }
}
