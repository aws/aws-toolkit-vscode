/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { _Blob } from 'aws-sdk/clients/lambda'
import _ = require('lodash')
import path = require('path')
import xml2js = require('xml2js')
import { AwsContext } from '../../shared/awsContext'
import { LambdaClient } from '../../shared/clients/lambdaClient'
import { ext } from '../../shared/extensionGlobals'
import { ExtensionUtilities } from '../../shared/extensionUtilities'
import { ResourceFetcher } from '../../shared/resourceFetcher'
import { FileResourceLocation, WebResourceLocation } from '../../shared/resourceLocation'
import { BaseTemplates } from '../../shared/templates/baseTemplates'
import { sampleRequestManifestPath, sampleRequestPath } from '../constants'
import { FunctionNodeBase } from '../explorer/functionNode'
import { SampleRequest } from '../models/sampleRequest'
import { LambdaTemplates } from '../templates/lambdaTemplates'
import { selectLambdaNode } from '../utils'

interface SampleRequestManifest {
    requests: {
        request: {
            name?: string
            filename?: string
        }[]
    }
}

interface CommandMessage {
    command: string
    value?: _Blob
}

export async function invokeLambda(
    awsContext: AwsContext,
    resourceFetcher: ResourceFetcher,
    element?: FunctionNodeBase
) {
    try {
        const fn: FunctionNodeBase = await selectLambdaNode(awsContext, element)
        const view = ext.vscode.window.createWebviewPanel(
            'html',
            `Invoked ${fn.configuration.FunctionName}`,
            ext.vscode.ViewColumn.One,
            {
                // Enable scripts in the webview
                enableScripts: true
            }
        )
        const baseTemplateFn = _.template(BaseTemplates.SIMPLE_HTML)

        view.webview.html = baseTemplateFn({
            content: '<h1>Loading...</h1>'
        })

        // ideally need to get the client from the explorer, but the context will do for now
        console.log('building template...')

        const invokeTemplateFn = _.template(LambdaTemplates.INVOKE_TEMPLATE)
        const resourcePath = path.join(ext.context.extensionPath, 'resources', 'vs-lambda-sample-request-manifest.xml')

        console.log(sampleRequestManifestPath)
        console.log(resourcePath)

        try {
            const sampleInput = await resourceFetcher.getResource([
                new WebResourceLocation(sampleRequestManifestPath),
                new FileResourceLocation(resourcePath)
            ])
            const inputs: SampleRequest[] = []

            console.log('querying manifest url')

            xml2js.parseString(sampleInput, { explicitArray: false }, (err: Error, result: SampleRequestManifest) => {
                console.log(result)

                if (err) {
                    return
                }

                _.forEach(result.requests.request, (r) => {
                    inputs.push({ name: r.name, filename: r.filename })
                })
            })

            const loadScripts = ExtensionUtilities.getScriptsForHtml(['invokeLambdaVue.js'])
            const loadLibs = ExtensionUtilities.getLibrariesForHtml(['vue.min.js'])

            console.log(loadLibs)

            view.webview.html = baseTemplateFn({
                content: invokeTemplateFn({
                    FunctionName: fn.configuration.FunctionName,
                    InputSamples: inputs,
                    Scripts: loadScripts,
                    Libraries: loadLibs
                }),
            })

            view.webview.onDidReceiveMessage(
                createMessageReceivedFunc(
                    resourceFetcher,
                    resourcePath,
                    message => view.webview.postMessage(message),
                    fn
                ),
                undefined,
                ext.context.subscriptions
            )
        } catch (err) {
            console.log('Error getting manifest data..')
            console.log(err)
        }
    } catch (err) {
        const error = err as Error
        console.log(error.message)
    }
}

function createMessageReceivedFunc(
    resourceFetcher: ResourceFetcher,
    resourcePath: string,
    postMessage: (message: any) => Thenable<boolean>,
    fn: FunctionNodeBase
) {
    return async (message: CommandMessage) => {
        switch (message.command) {
            case 'sampleRequestSelected':
                console.log('selected the following sample:')
                console.log(message.value)

                const sample = await resourceFetcher.getResource([
                    new WebResourceLocation(`${sampleRequestPath}${message.value}`),
                    new FileResourceLocation(resourcePath)
                ])

                console.log(sample)

                postMessage({ command: 'loadedSample', sample: sample })

                return

            case 'invokeLambda':
                console.log('invoking lambda function with the following payload:')
                console.log(message.value)

                ext.lambdaOutputChannel.show()
                ext.lambdaOutputChannel.appendLine('Loading response...')

                try {
                    if (!fn.configuration.FunctionArn) {
                        throw new Error(`Could not determine ARN for function ${fn.configuration.FunctionName}`)
                    }

                    const client: LambdaClient = ext.toolkitClientBuilder.createLambdaClient(fn.regionCode)
                    const funcResponse = await client.invoke(
                        fn.configuration.FunctionArn,
                        message.value
                    )
                    const logs = funcResponse.LogResult ?
                        Buffer.from(funcResponse.LogResult, 'base64').toString() :
                        ''
                    const payload = funcResponse.Payload ? funcResponse.Payload : JSON.stringify({})

                    ext.lambdaOutputChannel.appendLine(`Invocation result for ${fn.configuration.FunctionArn}`)
                    ext.lambdaOutputChannel.appendLine('Logs:')
                    ext.lambdaOutputChannel.appendLine(logs)
                    ext.lambdaOutputChannel.appendLine('')
                    ext.lambdaOutputChannel.appendLine('Payload:')
                    ext.lambdaOutputChannel.appendLine(payload.toString())
                    ext.lambdaOutputChannel.appendLine('')
                } catch (e) {
                    const error = e as Error

                    ext.lambdaOutputChannel.appendLine(`There was an error invoking ${fn.configuration.FunctionArn}`)
                    ext.lambdaOutputChannel.appendLine(error.toString())
                    ext.lambdaOutputChannel.appendLine('')
                }

                return
        }
    }
}
