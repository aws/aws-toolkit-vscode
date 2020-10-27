/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
// TODO: Move off of deprecated `request` to `got` or similar modern library.
import * as request from 'request'

/**
 * Makes a `get` request to a URL without params and returns the response asynchronously.
 * Can optionally pipe the call's data to a location.
 * Swallows error to hide the targeted URL. Recommended by security.
 * @param url URL to send request to
 * @param pipeLocation Filepath to pipe output to.
 */
export async function getResponseFromGetRequest(url: string, pipeLocation?: string): Promise<request.Response> {
    return new Promise<request.Response>((resolve, reject) => {
        const call = request(url, (err, response, body) => {
            if (err) {
                // swallow error to keep URL private
                // some AWS APIs use presigned links (e.g. Lambda.getFunction); showing these represent a securty concern.
                reject('Error making request to external URL.')
            }
            resolve(response)
        })

        if (pipeLocation) {
            call.pipe(fs.createWriteStream(pipeLocation))
        }
    })
}
