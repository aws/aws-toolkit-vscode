/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirp, readFileSync } from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import { ExtContext } from '../shared/extensions'
import { fileExists } from '../shared/filesystemUtilities'
import { getLogger } from '../shared/logger/logger'
import { HttpResourceFetcher } from '../shared/resourcefetcher/httpResourceFetcher'
import { getRemoteOrCachedFile } from '../shared/schemas'
import { normalizeSeparator } from '../shared/utilities/pathUtils'

export async function activate(ctx: ExtContext): Promise<void> {
    const sdkDefs = new SdkDefs(ctx)
    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.sdk.openSdk', async () => {
            if (await sdkDefs.isSdkDefsReady()) {
                // create webview
                sdkDefs.getServiceData('S3')
            }
        })
    )
}

interface GithubTreeNode {
    path: string
    type: string
    sha: string
    url: string
}

interface Metadata {
    [service: string]: {
        // JSON filename, but with dashes/periods removed
        prefix?: string // if present, the actual JSON filename
        name: string // the service's name. Good for both display AND client creation
    }
}

interface Service {
    documentation: string
    metadata: {
        serviceFullName: string
        apiVersion: string
        // plus a lot more fields that we probably don't care about
    }
    operations: Record<string, ServiceCall>
    shapes: Record<string, ServiceCallShape>
}

interface ServiceCall {
    documentation: string
    input: ServiceCallShape
    // plus a lot more fields: we don't care about error or output shapes!!! (probably)
}

interface ServiceCallShape {
    type: 'string' | 'list' | 'blob' | 'structure' | 'map' | 'integer' | 'timestamp' | 'double' | 'boolean' | 'long'
    enum?: string[]
    documentation?: string
    required?: string[]
    members?: {
        // required for structure and list
        documentation: string
        shape: ServiceCallShape
    }
    key?: {
        // required for map
        shape: ServiceCallShape
    }
    map?: {
        // required for map
        shape: ServiceCallShape
    }
    // max/min char length for strings; max/min value integers and doubles; max/min length for list
    min?: number
    max?: number
    pattern?: string // regex for string
}

type ServiceOrPlaceholder = Service | string

export interface ISdkDefs {
    isSdkDefsReady(): Promise<boolean>
    getServiceData(service: string): Promise<Service | undefined>
}

/**
 * Holds SDK definitions in memory.
 * Loads don't block JS execution (unless you attempt to access prior to loading fully)
 *
 */
class SdkDefs implements ISdkDefs {
    private sdkDefsAttempted: boolean = false
    private sdkDefs: Record<string, ServiceOrPlaceholder> = {}
    private sdkDefsPromise: Promise<void> | undefined = undefined
    private VERSION = `v${'2.916.0'}` // TODO: Find out how to get the SDK version from package.json
    private readonly defsDir = normalizeSeparator(
        path.join(this.ctx.extensionContext.globalStoragePath, 'sdkDefinitions')
    )
    private readonly metadataPath = path.join(this.defsDir, `metadata.json`)

    public constructor(private readonly ctx: ExtContext) {
        // start downloading/caching files in background.
        // don't block further loading; progress will be halted and evaluated in isSdkDefsReady call
        this.cacheSdkDefsPromise()
    }

    private cacheSdkDefsPromise() {
        this.sdkDefsAttempted = false
        this.sdkDefsPromise = this.cacheSdkDefs()
        this.sdkDefsPromise.catch(err => getLogger().error(err)).finally(() => (this.sdkDefsAttempted = true))
    }

    /**
     * Checks to see whether or not SDK definitions have loaded.
     * If a failure occurs, can retry loading SDKs.
     * @returns true if SDKs are loaded, false if not AND the user has opted out of additional attempts.
     */
    public async isSdkDefsReady(): Promise<boolean> {
        // TODO: async lock or have a scoped boolean to prevent multiple attempts at creating SdkDefs
        while (!this.sdkDefs) {
            if (!this.sdkDefsAttempted) {
                // show progress
                await this.sdkDefsPromise
            }
            if (Object.keys(this.sdkDefs).length === 0) {
                // prompt to try again
                // if we want to try again, call generateSdkDefsPromise()
                // else break
                this.cacheSdkDefsPromise()
            }
        }

        if (Object.keys(this.sdkDefs).length === 0) {
            getLogger().warn('User could not download or parse SDK defs and exited')
            return false
        }

        return true
    }

    private async cacheSdkDefs(): Promise<void> {
        if (!(await fileExists(this.defsDir))) {
            await mkdirp(this.defsDir)
        }

        // UNCOMMENT THIS STUFF ONCE WE GET A SUSTAINABLE SOLUTION FOR PULLING SERVICE JSON!!!
        // Figure out WTF is wrong with the cache key: it shouldn't keep pulling the same things over and over again...

        // TODO: Use Octokit OR cache copies on AWS-owned CDN!!!!!
        // needs auth to download the volume of stuff we need
        // const mainRepoFetcher = new HttpResourceFetcher(`https://api.github.com/repos/aws/aws-sdk-js/git/trees/${this.VERSION}`, {
        //     showUrl: true,
        // })
        // const mainRepo = await mainRepoFetcher.get()
        // if (!mainRepo) {
        //     throw new Error()
        // }
        // const mainRepoJson = JSON.parse(mainRepo)
        // const apis: GithubTreeNode = mainRepoJson.tree ? mainRepoJson.tree.find((el: GithubTreeNode) => el.path === 'apis' && el.sha ) : undefined
        // if (!apis) {
        //     throw new Error()
        // }

        // const apisContentsFetcher = new HttpResourceFetcher(`https://api.github.com/repos/aws/aws-sdk-js/git/trees/${apis.sha}`, {
        //     showUrl: true,
        // })
        // const apisContents = await apisContentsFetcher.get()
        // if (!apisContents) {
        //     throw new Error()
        // }
        // const apisJson = JSON.parse(apisContents)
        // const normalDefs: GithubTreeNode[] = apisJson.tree ? apisJson.tree.filter((el: GithubTreeNode) => /.normal.json$/.test(el.path) && el.type === 'blob').sort((a: GithubTreeNode, b: GithubTreeNode) => -(a.path.localeCompare(b.path))) : undefined

        // const promiseArr: Promise<string>[] = [getRemoteOrCachedFile({
        //     filepath: normalizeSeparator(this.metadataPath),
        //     version: this.VERSION,
        //     url: `https://raw.githubusercontent.com/aws/aws-sdk-js/${this.VERSION}/apis/metadata.json`,
        //     cacheKey: 'apiSdkManifestJson',
        //     extensionContext: this.ctx.extensionContext
        // })]
        // const serviceSet = new Set<string>()
        // for (const def of normalDefs) {
        //     const partsRegex = /^([a-zA-Z0-9\.-]{1,})-([0-9]{4}-[0-9]{2}-[0-9]{2})/
        //     const parts = partsRegex.exec(def.path)
        //     if (!parts || parts.length !== 3) {
        //         throw new Error()
        //     }
        //     if (serviceSet.has(parts[1])) {
        //         continue
        //     }
        //     serviceSet.add(parts[1])
        //     promiseArr.push(getRemoteOrCachedFile({
        //         filepath: normalizeSeparator(path.join(this.defsDir, `${parts[1]}.json`)),
        //         version: parts[2],
        //         url: `https://raw.githubusercontent.com/aws/aws-sdk-js/${this.VERSION}/apis/${def.path}`,
        //         cacheKey: parts[1],
        //         extensionContext: this.ctx.extensionContext
        //     }))
        // }

        // await Promise.all(promiseArr) // throws if fail

        const metadata: Metadata = JSON.parse(
            await getRemoteOrCachedFile({
                filepath: normalizeSeparator(this.metadataPath),
                version: this.VERSION,
                url: `https://raw.githubusercontent.com/aws/aws-sdk-js/${this.VERSION}/apis/metadata.json`,
                cacheKey: 'apiSdkManifestJson',
                extensionContext: this.ctx.extensionContext,
            })
        )

        const fileParsePromises: Promise<void>[] = []
        // Consider: should we load everything into memory immediately? 202 services (not all of them) === 25 MB
        Object.keys(metadata).forEach(key => {
            fileParsePromises.push(
                new Promise(async (resolve, reject) => {
                    const currFile = path.join(this.defsDir, `${metadata[key].prefix ?? key}.json`)
                    if (await fileExists(currFile)) {
                        // placeholder value is the file to look up
                        this.sdkDefs[metadata[key].name] = currFile
                    } else {
                        getLogger().warn(`Couldn't find SDK definition at ${currFile}`)
                    }
                    resolve()
                })
            )
        })

        await Promise.all(fileParsePromises)
    }

    /**
     * Gets Service data for a service.
     * Pulls from memory if service has already been used this session, otherwise pulls from downloaded copy
     * Returns undefined if the service wasn't loaded in the initial burst or if there was an issue reading/parsing the file
     * @param service Friendly service name
     * @returns Service data or undefined
     */
    public async getServiceData(service: string): Promise<Service | undefined> {
        if (!(await this.isSdkDefsReady())) {
            throw new Error('SDK defs not ready')
        }
        try {
            if (!this.sdkDefs[service]) {
                getLogger().warn(`Couldn't find SDK definition for service ${service}: not present in inital download`)
                return undefined
            }
            if (typeof this.sdkDefs[service] === 'string') {
                // file should be present at this point, otherwise will get caught
                this.sdkDefs[service] = JSON.parse(readFileSync(this.sdkDefs[service] as string).toString())
            }

            return this.sdkDefs[service] as Service
        } catch (e) {
            getLogger().error(e as Error)
            return undefined
        }
    }
}
