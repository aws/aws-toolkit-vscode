/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { _Blob } from 'aws-sdk/clients/lambda'
import _ = require('lodash')
import path = require('path')
import * as vscode from 'vscode'
import xml2js = require('xml2js')
import { AwsContext } from '../../shared/awsContext'
import { LambdaClient } from '../../shared/clients/lambdaClient'
import { ext } from '../../shared/extensionGlobals'
import { ExtensionUtilities } from '../../shared/extensionUtilities'
import { getLogger, Logger } from '../../shared/logger'
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

export async function invokeLambda(params: {
    /* TODO: Instead of vague scope-leaking objects: awsContext & element, it would be cleaner if this took:
     *  {
     *      lambdaClient: LambdaClient,         // or just invoke/invokeAsync interface of AWS.Lambda (see: lambda.d.ts)
     *      invokeParams: {functionArn: string} // or Lambda.Types.InvocationRequest (see: lambda.d.ts)
     *  }
     */
    awsContext: AwsContext, // TODO: Consider replacing 'awsContext' with something specific and meaningful
    outputChannel: vscode.OutputChannel,
    resourceFetcher: ResourceFetcher,
    element?: FunctionNodeBase, // TODO: Consider replacing 'element'' with something specific and meaningful
}) {

    const logger: Logger = getLogger()

    try {
        const fn: FunctionNodeBase = await selectLambdaNode(params.awsContext, params.element)
        const view = vscode.window.createWebviewPanel(
            'html',
            `Invoked ${fn.configuration.FunctionName}`,
            vscode.ViewColumn.One,
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
        logger.info('building template...')

        const invokeTemplateFn = _.template(LambdaTemplates.INVOKE_TEMPLATE)
        const resourcePath = path.join(ext.context.extensionPath, 'resources', 'vs-lambda-sample-request-manifest.xml')

        logger.info(sampleRequestManifestPath)
        logger.info(resourcePath)

        try {
            const sampleInput = await params.resourceFetcher.getResource([
                new WebResourceLocation(sampleRequestManifestPath),
                new FileResourceLocation(resourcePath)
            ])
            const inputs: SampleRequest[] = []

            logger.info('querying manifest url')

            xml2js.parseString(sampleInput, { explicitArray: false }, (err: Error, result: SampleRequestManifest) => {
                logger.info(result.toString())

                if (err) {
                    return
                }

                _.forEach(result.requests.request, (r) => {
                    inputs.push({ name: r.name, filename: r.filename })
                })
            })

            const loadScripts = ExtensionUtilities.getScriptsForHtml(['invokeLambdaVue.js'])
            const loadLibs = ExtensionUtilities.getLibrariesForHtml(['vue.min.js'])

            logger.info(loadLibs.toString())

            view.webview.html = baseTemplateFn({
                content: invokeTemplateFn({
                    FunctionName: fn.configuration.FunctionName,
                    InputSamples: inputs,
                    Scripts: loadScripts,
                    Libraries: loadLibs
                }),
            })

            view.webview.onDidReceiveMessage(
                createMessageReceivedFunc({
                    fn,
                    outputChannel: params.outputChannel,
                    resourceFetcher: params.resourceFetcher,
                    resourcePath: resourcePath,
                    onPostMessage: message  => view.webview.postMessage(message)
                }),
                undefined,
                ext.context.subscriptions
            )
        } catch (err) {
            logger.error('Error getting manifest data..', err as Error)
        }
    } catch (err) {
        const error = err as Error
        logger.error(error)
    }
}

function createMessageReceivedFunc({fn, outputChannel, ...restParams}: {
    // TODO: Consider passing lambdaClient: LambdaClient
    fn: FunctionNodeBase, // TODO: Replace w/ invokeParams: {functionArn: string} // or Lambda.Types.InvocationRequest
    outputChannel: vscode.OutputChannel
    resourceFetcher: ResourceFetcher,
    resourcePath: string,
    onPostMessage(message: any): Thenable<boolean>
}) {

    const logger: Logger = getLogger()

    return async (message: CommandMessage) => {
        switch (message.command) {
            case 'sampleRequestSelected':
                logger.info('selected the following sample:')
                logger.info(String(message.value))

                const sample = await restParams.resourceFetcher.getResource([
                    new WebResourceLocation(`${sampleRequestPath}${message.value}`),
                    new FileResourceLocation(restParams.resourcePath)
                ])

                logger.info(sample)

                restParams.onPostMessage({ command: 'loadedSample', sample: sample })

                return

            case 'invokeLambda':
                logger.info('invoking lambda function with the following payload:')
                logger.info(String(message.value))

                outputChannel.show()
                outputChannel.appendLine('Loading response...')

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

                    outputChannel.appendLine(`Invocation result for ${fn.configuration.FunctionArn}`)
                    outputChannel.appendLine('Logs:')
                    outputChannel.appendLine(logs)
                    outputChannel.appendLine('')
                    outputChannel.appendLine('Payload:')
                    outputChannel.appendLine(payload.toString())
                    outputChannel.appendLine('')
                } catch (e) {
                    const error = e as Error
                    outputChannel.appendLine(`There was an error invoking ${fn.configuration.FunctionArn}`)
                    outputChannel.appendLine(error.toString())
                    outputChannel.appendLine('')
                }

                return
        }
    }
}
