/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as querystring from 'querystring'
import { ext } from '../extensionGlobals'
import { getLogger } from '../logger/logger'

import * as nls from 'vscode-nls'
import { showViewLogsMessage } from '../utilities/messages'
const localize = nls.loadMessageBundle()

/** Handles an external URI targeting the extension */
export type PathHandler<T> = (query: T) => Promise<void> | void
/** Parses the 'query' or arguments from a URI */
export type QueryParser<T> = (query: querystring.ParsedUrlQuery) => Promise<T> | T | never

interface HandlerWithParser<T> {
    handler: PathHandler<T>
    parser?: QueryParser<T>
}

export class UriHandler implements vscode.UriHandler {
    private handlers: Map<string, HandlerWithParser<any>> = new Map()

    public async handleUri(uri: vscode.Uri): Promise<void> {
        getLogger().verbose(`UriHandler: received request on path "${uri.path}"`)

        const uriNoQuery = uri.with({ query: undefined }).toString()

        if (!this.handlers.has(uri.path)) {
            ext.window.showErrorMessage(localize('AWS.uriHandler.nohandler', 'No handler found for: {0}', uriNoQuery))
            getLogger().verbose(`UriHandler: no valid handler found for "${uri.path}"`)
            return
        }

        const { handler, parser } = this.handlers.get(uri.path)!
        let parsedQuery: Parameters<typeof handler>[0]

        // Not sure if this can even throw
        const query = querystring.parse(uri.query)

        try {
            parsedQuery = parser ? await parser(query) : query
        } catch (err) {
            showViewLogsMessage(localize('AWS.uriHandler.parser.failed', 'Failed to parse URI query: {0}', uriNoQuery))
            getLogger().error(`UriHandler: query parsing failed for path "${uri.path}": %O`, err)
            return
        }

        try {
            // This await is needed to catch unhandled rejected Promises
            return await handler(parsedQuery)
        } catch (err) {
            showViewLogsMessage(localize('AWS.uriHandler.handler.failed', 'Failed to handle URI: {0}', uriNoQuery))
            getLogger().error(`UriHandler: unexpected exception when handling "${uri.path}": %O`, err)
        }
    }

    /**
     * Registers a new handler for external URIs targeting the extension.
     *
     * @param path Target 'path', e.g. '/foo/bar'
     * @param handler Callback fired when the extension receives a URI that matches the path
     * @param parser Optional callback to parse the URI parameters prior to calling the handler
     *
     * @returns A disposable to remove the handler
     * @throws When a handler has already been registered
     */
    public registerHandler<T = querystring.ParsedUrlQuery>(
        path: string,
        handler: PathHandler<T>,
        parser?: QueryParser<T>
    ): vscode.Disposable {
        if (this.handlers.has(path)) {
            throw new Error(`UriHandler: "${path}" has already been registered`)
        }

        this.handlers.set(path, { handler, parser })
        return { dispose: () => this.handlers.delete(path) }
    }
}
