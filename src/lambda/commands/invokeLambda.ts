/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { _Blob } from 'aws-sdk/clients/lambda'
import _ = require('lodash')
import * as vscode from 'vscode'
import xml2js = require('xml2js')
import { LambdaClient } from '../../shared/clients/lambdaClient'
import { ext } from '../../shared/extensionGlobals'
import { ExtensionUtilities } from '../../shared/extensionUtilities'
import { getLogger, Logger } from '../../shared/logger'
import { CompositeResourceFetcher } from '../../shared/resourcefetcher/compositeResourceFetcher'
import { FileResourceFetcher } from '../../shared/resourcefetcher/fileResourceFetcher'
import { HttpResourceFetcher } from '../../shared/resourcefetcher/httpResourceFetcher'
import { ResourceFetcher } from '../../shared/resourcefetcher/resourcefetcher'
import { recordLambdaInvokeRemote, Result, Runtime } from '../../shared/telemetry/telemetry'
import { BaseTemplates } from '../../shared/templates/baseTemplates'
import { sampleRequestManifestPath, sampleRequestPath } from '../constants'
import { LambdaFunctionNode } from '../explorer/lambdaFunctionNode'
import { SampleRequest } from '../models/sampleRequest'
import { LambdaTemplates } from '../templates/lambdaTemplates'

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
    outputChannel: vscode.OutputChannel
    functionNode: LambdaFunctionNode
}) {
    const logger: Logger = getLogger()
    const functionNode = params.functionNode
    let invokeResult: Result = 'Succeeded'

    try {
        const view = vscode.window.createWebviewPanel(
            'html',
            `Invoked ${functionNode.configuration.FunctionName}`,
            vscode.ViewColumn.One,
            {
                // Enable scripts in the webview
                enableScripts: true,
            }
        )
        const baseTemplateFn = _.template(BaseTemplates.SIMPLE_HTML)

        view.webview.html = baseTemplateFn({
            cspSource: view.webview.cspSource,
            content: '<h1>Loading...</h1>',
        })

        // ideally need to get the client from the explorer, but the context will do for now
        const invokeTemplateFn = _.template(LambdaTemplates.INVOKE_TEMPLATE)

        logger.info('Loading Sample Requests Manifest')

        try {
            const sampleInput = await makeSampleRequestManifestResourceFetcher().get()

            if (!sampleInput) {
                throw new Error('Unable to retrieve Sample Request manifest')
            }

            logger.debug(`Loaded: ${sampleInput}`)

            const inputs: SampleRequest[] = []

            xml2js.parseString(sampleInput, { explicitArray: false }, (err: Error, result: SampleRequestManifest) => {
                if (err) {
                    return
                }

                _.forEach(result.requests.request, r => {
                    inputs.push({ name: r.name, filename: r.filename })
                })
            })

            const loadScripts = ExtensionUtilities.getScriptsForHtml(['invokeLambdaVue.js'], view.webview)
            const loadLibs = ExtensionUtilities.getLibrariesForHtml(['vue.min.js'], view.webview)

            view.webview.html = baseTemplateFn({
                cspSource: view.webview.cspSource,
                content: invokeTemplateFn({
                    FunctionName: functionNode.configuration.FunctionName,
                    InputSamples: inputs,
                    Scripts: loadScripts,
                    Libraries: loadLibs,
                }),
            })

            view.webview.onDidReceiveMessage(
                createMessageReceivedFunc({
                    fn: functionNode,
                    outputChannel: params.outputChannel,
                    onPostMessage: message => view.webview.postMessage(message),
                }),
                undefined,
                ext.context.subscriptions
            )
        } catch (err) {
            invokeResult = 'Failed'
            logger.error('Error getting manifest data..: %O', err as Error)
        }
    } catch (err) {
        invokeResult = 'Failed'
        logger.error(err as Error)
    } finally {
        recordLambdaInvokeRemote({
            result: invokeResult,
            runtime: functionNode.configuration.Runtime as Runtime,
        })
    }
}

function createMessageReceivedFunc({
    fn,
    outputChannel,
    ...restParams
}: {
    // TODO: Consider passing lambdaClient: LambdaClient
    fn: LambdaFunctionNode // TODO: Replace w/ invokeParams: {functionArn: string} // or Lambda.Types.InvocationRequest
    outputChannel: vscode.OutputChannel
    onPostMessage(message: any): Thenable<boolean>
}) {
    const logger: Logger = getLogger()

    return async (message: CommandMessage) => {
        switch (message.command) {
            case 'sampleRequestSelected': {
                logger.info(`Requesting ${message.value}`)
                const sampleUrl = `${sampleRequestPath}${message.value}`

                const sample = (await new HttpResourceFetcher(sampleUrl).get()) ?? ''

                logger.debug(`Retrieved: ${sample}`)

                restParams.onPostMessage({ command: 'loadedSample', sample: sample })

                return
            }
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
                    const funcResponse = await client.invoke(fn.configuration.FunctionArn, message.value)
                    const logs = funcResponse.LogResult ? Buffer.from(funcResponse.LogResult, 'base64').toString() : ''
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

function makeSampleRequestManifestResourceFetcher(): ResourceFetcher {
    return new CompositeResourceFetcher(
        new HttpResourceFetcher(sampleRequestManifestPath),
        new FileResourceFetcher(ext.manifestPaths.lambdaSampleRequests)
    )
}
