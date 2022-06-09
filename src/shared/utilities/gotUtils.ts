/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as http from 'http'
import * as https from 'https'
import got, { Got, GotReturn } from 'got'
import urlToOptions from 'got/dist/source/core/utils/url-to-options'
import { userAgent } from '../vscode/env'
import { CancellationError, isCancelEvent, isTypedCancellationToken } from './timeoutUtils'
import { CancellationToken } from 'vscode'
import { isCloud9 } from '../extensionUtilities'

// XXX: patched Got module for compatability with Cloud9
// `got` has also deprecated `urlToOptions`
export function patchedGot(): Got {
    if (!isCloud9()) {
        return got
    }

    return got.extend({
        request: (url, options, callback) => {
            if (url.protocol === 'https:') {
                return https.request({ ...options, ...urlToOptions(url) }, callback)
            }
            return http.request({ ...options, ...urlToOptions(url) }, callback)
        },
    })
}

export function withCancellationToken(cancellationToken?: CancellationToken, target = got): Got {
    if (cancellationToken?.isCancellationRequested) {
        const token = cancellationToken

        if (isTypedCancellationToken(token) && token.isCancellationRequested) {
            throw new CancellationError(token.cancellationReason.agent)
        } else {
            throw new CancellationError('user')
        }
    }

    function isCancellable(obj: unknown): obj is { cancel(): void } {
        return typeof obj === 'object' && !!obj && typeof (obj as any).cancel === 'function'
    }

    function cancel(event: unknown, request: GotReturn): void {
        const response = isCancelEvent(event) ? new CancellationError(event.agent) : undefined
        isCancellable(request) ? request.cancel(response?.message) : request.destroy(response)
    }

    return target.extend({
        headers: { 'User-Agent': userAgent() },
        handlers: [
            (options, next) => {
                const request = next(options)
                cancellationToken?.onCancellationRequested(event => cancel(event, request))

                return request
            },
        ],
    })
}
