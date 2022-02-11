/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { compileVueWebview } from '../webviews/main'
import { ExtContext } from '../shared/extensions'
import { SdkDefs, SdkDefService } from './sdkDefs'
import * as AWS from 'aws-sdk'

import * as nls from 'vscode-nls'
import { PromiseResult } from 'aws-sdk/lib/request'
import { WebviewServer } from '../webviews/server'
import { getRegionsForActiveCredentials } from '../shared/regions/regionUtilities'
import globals from '../shared/extensionGlobals'
import { Region } from '../shared/regions/endpoints'
import { doTraverseAndPrune } from '../lambda/configEditor/vue/samInvokeBackend'
import { getLogger } from '../shared/logger/logger'
const localize = nls.loadMessageBundle()

export interface InitialData {
    services: string[]
    regions: Region[]
    profile: string
}

interface MakeSdkCallParams {
    service: string
    api: string
    region: string
}

interface AWSServiceLike {
    [api: string]: (data: any) => {
        promise: () => PromiseResult<any, AWS.AWSError>
    }
}

const VueWebview = compileVueWebview({
    id: 'sdkAccess',
    title: localize('AWS.sdkAccess.title', 'AWS API Caller'),
    webviewJs: 'sdkAccessVue.js',
    commands: {
        getServiceDefinition: async function (servicename: string) {
            const service = await getServiceDefinition(servicename)
            if (service) {
                this.emitters.onLoadedServiceDefinition.fire(service)
            } else {
                throw new Error('Service is undefined')
            }
        },
        makeSdkCall: async function (params: MakeSdkCallParams, data: any) {
            try {
                const response = await makeSdkCall(this, params, data)
                this.emitters.onSDKResponse.fire(response)
            } catch (e) {
                this.emitters.onSDKResponse.fire({ ERROR: e })
            }
        },
    },
    events: {
        onLoadedServiceDefinition: new vscode.EventEmitter<SdkDefService>(),
        onSDKResponse: new vscode.EventEmitter<any>(),
    },
    start: (init: InitialData) => init,
    viewColumn: vscode.ViewColumn.Active,
})
export class SdkAccessWebview extends VueWebview {}

export async function createSdkAccessWebview(ctx: ExtContext): Promise<void> {
    const profile = ctx.awsContext.getCredentialProfileName()
    const regions = getRegionsForActiveCredentials(ctx.awsContext, globals.regionProvider)
    if (!profile) {
        vscode.window.showErrorMessage('Must have credentials! TODO: Localize')
        return
    }
    try {
        const wv = new SdkAccessWebview(ctx)
        await wv.start({
            services: (await SdkDefs.getInstance().getAvailableServices()).sort((a, b) => a.localeCompare(b)),
            regions: regions,
            profile,
        })
    } catch (e) {}
}

async function getServiceDefinition(service: string): Promise<SdkDefService | undefined> {
    const sdkDefs = SdkDefs.getInstance()
    return await sdkDefs.getServiceData(service)
}

// TODO: handle blobs
async function makeSdkCall(server: WebviewServer, params: MakeSdkCallParams, request: any): Promise<any> {
    // client abstractions? we don't need no stinkin' client abstractions
    const AWSLike = AWS as any // big yikes
    const apiName = `${params.api[0].toLowerCase()}${params.api.slice(1)}`
    const prunedRequest = doTraverseAndPrune(request) ?? {}
    if (!prunedRequest) {
        throw new Error('Request was empty!')
    }
    const client: AWSServiceLike = new AWSLike[params.service]({
        region: params.region,
        credentials: await server.context.awsContext.getCredentials(),
    })
    return await client[apiName](prunedRequest).promise()
}
