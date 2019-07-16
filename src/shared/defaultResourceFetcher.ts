/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fse from 'fs-extra'
import request = require('request')
import { getLogger, Logger } from './logger'
import { ResourceFetcher } from './resourceFetcher'
import { FileResourceLocation, ResourceLocation, WebResourceLocation } from './resourceLocation'

export class DefaultResourceFetcher implements ResourceFetcher {

    // Attempts to retrieve a resource from the given locations in order, stopping on the first success.
    public async getResource(resourceLocations: ResourceLocation[]): Promise<string> {

        const logger: Logger = getLogger()
        if (resourceLocations.length === 0) {
            throw new Error('no locations provided to get resource from')
        }

        for (const resourceLocation of resourceLocations) {
            try {
                let result: string
                if (resourceLocation instanceof WebResourceLocation) {
                    result = await this.getWebResource(resourceLocation)
                } else if (resourceLocation instanceof FileResourceLocation) {
                    result = await this.getFileResource(resourceLocation)
                } else {
                    throw new Error(`Unknown resource location type: ${typeof resourceLocation}`)
                }

                return Promise.resolve(result)
            } catch (err) {
                // Log error, then try the next fallback location if there is one.
                const error = err as Error
                logger.error(`Error getting resource from ${resourceLocation.getLocationUri()} : `, error)
            }
        }

        return Promise.reject(new Error('Resource could not be found'))
    }

    // Http based file retriever
    public async getWebResource(resourceLocation: WebResourceLocation): Promise<string> {
        return new Promise<string>((resolve, reject) => {

            // TODO: consider inject cache lookup here, or put that in a separate ResourceFetcherBase class

            request(resourceLocation.getLocationUri(), {}, (err, res, body: string) => {

                if (!!err) {
                    reject(err)
                } else {
                    resolve(body)
                }
            })
        })
    }

    // Local file retriever
    public async getFileResource(resourceLocation: FileResourceLocation): Promise<string> {
        return new Promise<string>((resolve, reject) => {

            try {
                const content = fse.readFileSync(resourceLocation.getLocationUri()).toString()
                resolve(content)
            } catch (err) {
                reject(err)
            }
        })
    }
}
