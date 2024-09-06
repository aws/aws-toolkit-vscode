/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 *  Copyright 2022 Sourcegraph, Inc.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 */
import * as vscode from 'vscode'
import http from 'http'
import https from 'https'
import { getLogger } from '../../shared/logger'

// The path to the exported class can be found in the npm contents
// https://www.npmjs.com/package/@vscode/proxy-agent?activeTab=code
const nodeModules = '_VSCODE_NODE_MODULES'
const proxyAgentPath = '@vscode/proxy-agent/out/agent'
const proxyAgent = 'PacProxyAgent'
export const keepAliveHeader = 'keep-alive-codewhisperer'
let userProxyUrl = ''

export function updateUserProxyUrl() {
    userProxyUrl = vscode.workspace.getConfiguration('http').get('proxy') || ''
}

export function initializeNetworkAgent(): void {
    /**
     * We use keepAlive agents here to avoid excessive SSL/TLS handshakes for autocomplete requests.
     * Socket timeout at client is the same as service connection idle timeout
     */
    const httpAgent = new http.Agent({ keepAlive: true, timeout: 60000 })
    const httpsAgent = new https.Agent({ keepAlive: true, timeout: 60000 })

    const customAgent = ({ protocol }: Pick<URL, 'protocol'>): http.Agent => {
        if (protocol === 'http:') {
            return httpAgent
        }
        return httpsAgent
    }
    updateUserProxyUrl()
    /**
     * This works around an issue in the default VS Code proxy agent code. When `http.proxySupport`
     * is set to its default value and no proxy setting is being used, the proxy library does not
     * properly reuse the agent set on the http(s) method and is instead always using a new agent
     * per request.
     *
     * To work around this, we patch the default proxy agent method and overwrite the
     * `originalAgent` value before invoking it for requests that want to keep their connection
     * alive only when user is not using their own http proxy and the request contains keepAliveHeader
     *
     * c.f. https://github.com/microsoft/vscode/issues/173861
     * code reference: https://github.com/sourcegraph/cody/pull/868/files
     */
    try {
        const PacProxyAgent = (globalThis as any)?.[nodeModules]?.[proxyAgentPath]?.[proxyAgent] ?? undefined
        if (PacProxyAgent) {
            const originalConnect = PacProxyAgent.prototype.connect
            // Patches the implementation defined here:
            // https://github.com/microsoft/vscode-proxy-agent/blob/d340b9d34684da494d6ebde3bcd18490a8bbd071/src/agent.ts#L53
            PacProxyAgent.prototype.connect = function (req: http.ClientRequest, opts: { protocol: string }): any {
                try {
                    const connectionHeader = req.getHeader('connection')
                    const connectionHeaderHasKeepAlive =
                        connectionHeader === keepAliveHeader ||
                        (Array.isArray(connectionHeader) && connectionHeader.includes(keepAliveHeader))
                    if (connectionHeaderHasKeepAlive && userProxyUrl === '') {
                        this.opts.originalAgent = customAgent(opts)
                        return originalConnect.call(this, req, opts)
                    }
                    return originalConnect.call(this, req, opts)
                } catch {
                    return originalConnect.call(this, req, opts)
                }
            }
        } else {
            getLogger().info('PacProxyAgent not found')
        }
    } catch (error) {
        // Log any errors in the patching logic
        getLogger().error('Failed to patch http agent', error)
    }
}
