/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs-extra'
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
import { normalize } from '../shared/utilities/pathUtils'
const localize = nls.loadMessageBundle()

export interface InitialData {
    services: string[]
    regions: Region[]
    defaultRegion: string
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
    title: localize('AWS.sdkAccess.title', 'AWS SDK Invoker'),
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
        makeSdkCall: async function (params: MakeSdkCallParams, data: any, dryrun: boolean) {
            const response = await makeSdkCall(this, params, data, dryrun)
            this.emitters.onSDKResponse.fire(response)
        },
    },
    events: {
        onLoadedServiceDefinition: new vscode.EventEmitter<SdkDefService>(),
        onSDKResponse: new vscode.EventEmitter<any>(),
    },
    start: (init: InitialData) => init,
    viewColumn: vscode.ViewColumn.Active,
    retainContextWhenHidden: true, // TODO: don't do this
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
            defaultRegion: ctx.awsContext.getCredentialDefaultRegion(),
        })
    } catch (e) {}
}

async function getServiceDefinition(service: string): Promise<SdkDefService | undefined> {
    const sdkDefs = SdkDefs.getInstance()

    return await sdkDefs.getServiceData(service)
}

async function makeSdkCall(
    server: WebviewServer,
    params: MakeSdkCallParams,
    request: any,
    dryrun: boolean
): Promise<any> {
    // client abstractions? we don't need no stinkin' client abstractions
    const AWSLike = AWS as any // big yikes
    let hasBlob: boolean = false
    // TODO: better blob handling here? Get something that doesn't json.stringify into a string
    const prunedRequest =
        doTraverseAndPrune(request, {
            criteria: (o: any) => o && typeof o.path === 'string' && o.blob === true,
            transform: (o: any) => {
                hasBlob = true
                return `fs.readFileSync('${normalize(o.path)}')`
            },
        }) ?? {}
    const credentialsName = server.context.awsContext.getCredentialProfileName()
    if (dryrun) {
        return {
            request: generateSampleCode(params, credentialsName, prunedRequest, hasBlob),
            response: '(no response -- generated sample code)',
        }
    }
    try {
        const bufferedRequest =
            doTraverseAndPrune(request, {
                criteria: (o: any) => o && typeof o.path === 'string' && o.blob === true,
                transform: (o: any) => {
                    return fs.readFileSync(normalize(o.path))
                },
            }) ?? {}
        const apiName = strToCamelCase(params.api)
        const client: AWSServiceLike = new AWSLike[params.service]({
            region: params.region,
            credentials: await server.context.awsContext.getCredentials(),
        })

        return {
            request: prunedRequest,
            response: await client[apiName](bufferedRequest).promise(),
        }
    } catch (e) {
        return { request: prunedRequest, ERROR: e }
    }
}

function strToCamelCase(s: string): string {
    return s.length >= 1 ? `${s[0].toLowerCase()}${s.slice(1)}` : s
}

function generateSampleCode(
    params: MakeSdkCallParams,
    credentials: string | undefined,
    request: any,
    hasBlob: boolean
): string {
    const clientName = strToCamelCase(params.service)
    const credentialsName = credentials?.slice(credentials.indexOf(':') + 1)
    return `// note: sample code is currently using the AWS JS SDK v2, written for NodeJS
// see details here: https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/welcome.html

// import the AWS SDK
var AWS = require('aws-sdk');${
        hasBlob
            ? "\n// NOTE!: sample code generator is currently WIP.\n//remove the quotes wrapping the `fs.readFileSync` calls in the request body!\nvar fs = require('fs');"
            : ''
    }

// Set credentials and Region
// This can also be done directly on the service client
${credentialsName ? `var profileCredentials = new AWS.SharedIniFileCredentials({profile: '${credentialsName}'});` : ''}
AWS.config.update({region: '${params.region}'${credentials ? ', credentials: profileCredentials' : ''}});

// initialize client
var ${clientName} = new AWS.${params.service}();

// make call: sample shows callback
// convert to promise by appending \`.promise()\` and removing callback function parameter
${clientName}.${strToCamelCase(params.api)}(${JSON.stringify(request)}, (err, data) => {
    if (err) {
        throw err;
    }
    console.log(data);
});`
}
