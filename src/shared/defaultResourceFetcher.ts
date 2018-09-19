'use strict'

import request = require('request')
import * as fse from 'fs-extra'
import { ResourceFetcher } from './resourceFetcher'
import { WebResourceLocation, FileResourceLocation, ResourceLocation } from './resourceLocation'

export class DefaultResourceFetcher implements ResourceFetcher {
    // Attempts to retrieve a resource from the given locations in order, stopping on the first success.
    async getResource(resourceLocations: ResourceLocation[]): Promise<string> {
        if (resourceLocations.length === 0) {
            throw new Error("no locations provided to get resource from")
        }

        for (let resourceLocation of resourceLocations) {
            try {
                let result: string
                if (resourceLocation instanceof WebResourceLocation) {
                    result = await this.getWebResource(resourceLocation)
                }
                else if (resourceLocation instanceof FileResourceLocation) {
                    result = await this.getFileResource(resourceLocation)
                }
                else {
                    throw new Error(`Unknown resource location type: ${typeof resourceLocation}`)
                }
                return Promise.resolve(result)
            } catch (err) {
                // Log error, then try the next fallback location if there is one.
                console.log(`Error getting resource from ${resourceLocation.getLocationUri()} : ${err}`)
            }
        }

        return Promise.reject(new Error("Resource could not be found"))
    }

    // Http based file retriever
    async getWebResource(resourceLocation: WebResourceLocation): Promise<string> {
        return new Promise<string>((resolve, reject) => {

            // TODO: consider inject cache lookup here, or put that in a separate ResourceFetcherBase class

            request(resourceLocation.getLocationUri(), {}, (err, res, body) => {

                if (err) {
                    reject(err)
                } else {
                    resolve(body)
                }
            })
        })
    }

    // Local file retriever
    async getFileResource(resourceLocation: FileResourceLocation): Promise<string> {
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

