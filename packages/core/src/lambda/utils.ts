/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import path from 'path'
import xml2js = require('xml2js')
import { Lambda } from 'aws-sdk'
import * as vscode from 'vscode'
import { CloudFormationClient, StackSummary } from '../shared/clients/cloudFormation'
import { DefaultLambdaClient, LambdaClient } from '../shared/clients/lambdaClient'
import { getFamily, getNodeMajorVersion, RuntimeFamily } from './models/samLambdaRuntime'
import { getLogger } from '../shared/logger/logger'
import { HttpResourceFetcher } from '../shared/resourcefetcher/httpResourceFetcher'
import { FileResourceFetcher } from '../shared/resourcefetcher/fileResourceFetcher'
import { sampleRequestManifestPath } from './constants'
import globals from '../shared/extensionGlobals'
import { tempDirPath } from '../shared/filesystemUtilities'
import { LambdaFunction } from './commands/uploadLambda'
import { fs } from '../shared/fs/fs'

export async function* listCloudFormationStacks(client: CloudFormationClient): AsyncIterableIterator<StackSummary> {
    // TODO: this 'loading' message needs to go under each regional entry
    // in the explorer, and be removed when that region's query completes
    const status = vscode.window.setStatusBarMessage(
        localize('AWS.message.statusBar.loading.cloudFormation', 'Loading CloudFormation Stacks...')
    )

    try {
        yield* client.listStacks()
    } finally {
        status.dispose()
    }
}

export async function* listLambdaFunctions(client: LambdaClient): AsyncIterableIterator<Lambda.FunctionConfiguration> {
    const status = vscode.window.setStatusBarMessage(
        localize('AWS.message.statusBar.loading.lambda', 'Loading Lambdas...')
    )

    try {
        yield* client.listFunctions()
    } finally {
        if (status) {
            status.dispose()
        }
    }
}

export async function* listLayerVersions(
    client: LambdaClient,
    name: string
): AsyncIterableIterator<Lambda.LayerVersionsListItem> {
    const status = vscode.window.setStatusBarMessage(
        localize('AWS.message.statusBar.loading.lambda', 'Loading Lambda Layer Versions...')
    )

    try {
        yield* client.listLayerVersions(name)
    } finally {
        if (status) {
            status.dispose()
        }
    }
}

/**
 * Returns filename and function name corresponding to a Lambda.FunctionConfiguration
 * Only works for supported languages (Python/JS)
 * @param configuration Lambda configuration object from getFunction
 */
export function getLambdaDetails(configuration: Lambda.FunctionConfiguration): {
    fileName: string
    functionName: string
} {
    let runtimeExtension: string
    switch (getFamily(configuration.Runtime!)) {
        case RuntimeFamily.Python:
            runtimeExtension = 'py'
            break
        case RuntimeFamily.NodeJS: {
            const nodeVersion = getNodeMajorVersion(configuration.Runtime)
            if (nodeVersion && nodeVersion >= 18) {
                // node18+ defaults to using the .mjs extension
                runtimeExtension = 'mjs'
            } else {
                runtimeExtension = 'js'
            }
            break
        }
        case RuntimeFamily.Ruby:
            runtimeExtension = 'rb'
            break
        default:
            throw new Error(`Toolkit does not currently support imports for runtime: ${configuration.Runtime}`)
    }

    const handlerArr = configuration.Handler!.split('.')

    return {
        fileName: `${handlerArr.slice(0, handlerArr.length - 1).join('.')}.${runtimeExtension}`,
        functionName: handlerArr[handlerArr.length - 1]!,
    }
}

export interface SampleRequest {
    name: string | undefined
    filename: string | undefined
}

interface SampleRequestManifest {
    requests: {
        request: SampleRequest[]
    }
}

export async function getSampleLambdaPayloads(): Promise<SampleRequest[]> {
    const logger = getLogger()
    const sampleInput = await getSampleRequestManifest()

    if (!sampleInput) {
        throw new Error('Unable to retrieve Sample Request manifest')
    }

    logger.debug(`Loaded: ${sampleInput}`)

    const inputs: SampleRequest[] = []

    xml2js.parseString(sampleInput, { explicitArray: false }, (err: Error | null, result: SampleRequestManifest) => {
        if (err) {
            return
        }

        inputs.push(...result.requests.request)
    })

    return inputs
}

async function getSampleRequestManifest(): Promise<string | undefined> {
    const httpResp = await new HttpResourceFetcher(sampleRequestManifestPath, { showUrl: true }).get()
    if (!httpResp) {
        const fileResp = new FileResourceFetcher(globals.manifestPaths.lambdaSampleRequests)
        return fileResp.get()
    }
    return httpResp.text()
}

function getInfoLocation(lambda: LambdaFunction): string {
    return path.join(getTempRegionLocation(lambda.region), `.${lambda.name}`)
}

export async function getCodeShaLive(lambda: LambdaFunction): Promise<string | undefined> {
    const lambdaClient = new DefaultLambdaClient(lambda.region)
    const func = await lambdaClient.getFunction(lambda.name)
    return func.Configuration?.CodeSha256
}

export async function compareCodeSha(lambda: LambdaFunction): Promise<boolean> {
    const local = await getFunctionInfo(lambda, 'sha')
    const remote = await getCodeShaLive(lambda)
    getLogger().info(`local: ${local}, remote: ${remote}`)
    return local === remote
}

export async function getFunctionInfo(lambda: LambdaFunction, field?: 'lastDeployed' | 'undeployed' | 'sha') {
    try {
        const data = JSON.parse(await fs.readFileText(getInfoLocation(lambda)))
        getLogger().debug('Data returned from getFunctionInfo for %s: %O', lambda.name, data)
        return field ? data[field] : data
    } catch {
        return field ? undefined : {}
    }
}

export async function setFunctionInfo(
    lambda: LambdaFunction,
    info: { lastDeployed?: number; undeployed?: boolean; sha?: string }
) {
    try {
        const existing = await getFunctionInfo(lambda)
        const updated = {
            lastDeployed: info.lastDeployed ?? existing.lastDeployed,
            undeployed: info.undeployed ?? true,
            sha: info.sha ?? (await getCodeShaLive(lambda)),
        }
        await fs.writeFile(getInfoLocation(lambda), JSON.stringify(updated))
    } catch (err) {
        getLogger().warn(`codesha: unable to save information at key "${lambda.name}: %s"`, err)
    }
}

export const lambdaTempPath = path.join(tempDirPath, 'lambda')

export function getTempRegionLocation(region: string) {
    return path.join(lambdaTempPath, region)
}

export function getTempLocation(functionName: string, region: string) {
    return path.join(getTempRegionLocation(region), functionName)
}

type LambdaEdit = {
    location: string
    functionName: string
    region: string
    configuration?: Lambda.FunctionConfiguration
}

// Array to keep the list of functions that are being edited.
export const lambdaEdits: LambdaEdit[] = []

// Given a particular function and region, it returns the full LambdaEdit object
export function getLambdaEditFromNameRegion(name: string, functionRegion: string) {
    return lambdaEdits.find(({ functionName, region }) => functionName === name && region === functionRegion)
}

// Given a particular localPath, it returns the full LambdaEdit object
export function getLambdaEditFromLocation(functionLocation: string) {
    return lambdaEdits.find(({ location }) => location === functionLocation)
}
