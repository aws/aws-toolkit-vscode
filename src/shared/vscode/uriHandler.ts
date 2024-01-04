/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../logger/logger'

import * as nls from 'vscode-nls'
import { showViewLogsMessage } from '../utilities/messages'
import { URL, URLSearchParams } from 'url'

const localize = nls.loadMessageBundle()

/** Handles an external URI targeting the extension */
export type PathHandler<T> = (query: T) => Promise<void> | void
/** Parses the 'query' or arguments from a URI */
export type QueryParser<T> = (params: SearchParams) => Promise<T> | T | never

interface HandlerWithParser<T> {
    handler: PathHandler<T>
    parser?: QueryParser<T>
}

/**
 * Note: https://code.visualstudio.com/api/references/vscode-api#window.registerUriHandler
 * > An extension can only register a single uri handler in its entire activation lifetime.
 */
export class UriHandler implements vscode.UriHandler {
    public constructor() {}

    private handlers: Map<string, HandlerWithParser<any>> = new Map()

    public async handleUri(uri: vscode.Uri): Promise<void> {
        const uriNoQuery = uri.with({ query: '' }).toString()

        if (!this.handlers.has(uri.path)) {
            void showViewLogsMessage(localize('AWS.uriHandler.nohandler', 'No handler for URI: {0}', uriNoQuery))
            getLogger().warn('UriHandler: no handler for path "%s" in handlers: %O', uri.path, this.handlers)
            return
        }
        getLogger().verbose('UriHandler: found handler for path "%s"', uri.path)

        const { handler, parser } = this.handlers.get(uri.path)!
        let parsedQuery: Parameters<typeof handler>[0]

        const url = new URL(uri.toString(true))
        const params = new SearchParams(url.searchParams)

        try {
            parsedQuery = parser ? await parser(params) : params
        } catch (err) {
            const failedParsedMessage = localize(
                'AWS.uriHandler.parser.failed',
                'Failed to parse URI query: {0}',
                uriNoQuery
            )
            void showViewLogsMessage(failedParsedMessage)
            getLogger().error(`UriHandler: query parsing failed for path "${uri.path}": %O`, err)
            return
        }

        try {
            // This await is needed to catch unhandled rejected Promises
            return await handler(parsedQuery)
        } catch (err) {
            const failedResolvedMessage = localize(
                'AWS.uriHandler.handler.failed',
                'Failed to handle URI: {0}',
                uriNoQuery
            )
            void showViewLogsMessage(failedResolvedMessage)
            getLogger().error(`UriHandler: unexpected exception when handling "${uri.path}": %O`, err)
        }
    }

    /**
     * Adds a "path handler" for `vscode://amazonwebservices.aws-toolkit-vscode/<path>` URIs.
     *
     *
     * @param path Target path, e.g. "/foo/bar" handles URI: `vscode://amazonwebservices.aws-toolkit-vscode/foo/bar`.
     * @param handler Callback fired when the extension receives a URI that matches `path`.
     * @param parser Optional callback to parse the URI parameters prior to calling the handler
     *
     * @returns A disposable to remove the handler
     * @throws When a handler has already been registered
     */
    public onPath<U extends T, T = URLSearchParams>(
        path: string,
        handler: PathHandler<U>,
        parser?: QueryParser<T>
    ): vscode.Disposable {
        if (this.handlers.has(path)) {
            throw new Error(`UriHandler: "${path}" has already been registered`)
        }

        this.handlers.set(path, { handler, parser })
        return { dispose: () => this.handlers.delete(path) }
    }
}

/**
 * Minimal wrapper around {@link URLSearchParams} for better ergonomics.
 */
export class SearchParams extends URLSearchParams {
    public getAs<T>(name: string, mapper: (v: string) => T): T | undefined {
        return super.has(name) ? mapper(super.get(name)!) : undefined
    }

    public getOrThrow(name: string, message: string | Error): string {
        this.assertHas(name, message)
        return super.get(name)!
    }

    public getAsOrThrow<T>(name: string, message: string | Error, mapper: (v: string) => T): T {
        this.assertHas(name, message)
        return this.getAs(name, mapper)!
    }

    public getFromKeys<T extends readonly string[]>(...keys: T): { [P in T[number]]: string | undefined } {
        return keys.reduce(
            (a, b: T[number]) => ((a[b] = super.get(b) ?? undefined), a),
            {} as { [P in T[number]]: string | undefined }
        )
    }

    public getFromKeysOrThrow<T extends readonly string[]>(...keys: T): { [P in T[number]]: string } {
        return keys.reduce(
            (a, b: T[number]) => ((a[b] = this.getOrThrow(b, `"${b}" must be provided`)), a),
            {} as { [P in T[number]]: string }
        )
    }

    private assertHas(name: string, message: string | Error): void | never {
        if (!super.has(name)) {
            throw message instanceof Error ? message : new Error(message)
        }
    }
}
