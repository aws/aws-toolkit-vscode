'use strict';

import xml2js = require('xml2js');
import path = require('path');
import { FunctionNode } from "../explorer/functionNode";
import { getSelectedLambdaNode } from '../utils';
import { BaseTemplates } from "../../shared/templates/baseTemplates";
import * as vscode from 'vscode';
import _ = require("lodash");
import { ext } from "../../shared/extensionGlobals";
import { LambdaTemplates } from "../templates/lambdaTemplates";
import { AWSError } from "aws-sdk";
import { ResourceFetcher } from "../../shared/resourceFetcher";
import { sampleRequestManifestPath, sampleRequestPath } from "../constants";
import { SampleRequest } from '../models/sampleRequest';
import { ExtensionUtilities } from '../../shared/extensionUtilities';

export async function invokeLambda(element?: FunctionNode) {
    try {
        const fn: FunctionNode = await getSelectedLambdaNode(element);

        const view = vscode.window.createWebviewPanel(
            'html',
            `Invoked ${fn.functionConfiguration.FunctionName}`,
            vscode.ViewColumn.One,
            {
                // Enable scripts in the webview
                enableScripts: true
            }
        );
        const baseTemplateFn = _.template(BaseTemplates.SimpleHTML);
        view.webview.html = baseTemplateFn({
            content: `<h1>Loading...</h1>`
        });

        // ideally need to get the client from the explorer, but the context will do for now
        console.log('building template...');
        const invokeTemplateFn = _.template(LambdaTemplates.InvokeTemplate);
        const resourcePath = path.join(ext.context.extensionPath, 'resources', 'vs-lambda-sample-request-manifest.xml');
        console.log(sampleRequestManifestPath);
        console.log(resourcePath);
        try {
            const sampleInput = await ResourceFetcher.fetchHostedResource(sampleRequestManifestPath, resourcePath);
            const inputs: SampleRequest[] = [];
            console.log('querying manifest url');
            xml2js.parseString(sampleInput, { explicitArray: false }, (err, result) => {
                console.log(result);
                if (err) { return; }
                _.forEach(result.requests.request, (r) => {
                    inputs.push({ name: r.name, filename: r.filename });
                });
            });
            const loadScripts = ExtensionUtilities.getScriptsForHtml(['invokeLambdaVue.js']);
            const loadLibs = ExtensionUtilities.getLibrariesForHtml(['vue.min.js']);
            console.log(loadLibs);
            view.webview.html = baseTemplateFn({
                content: invokeTemplateFn({
                    FunctionName: fn.functionConfiguration.FunctionName,
                    InputSamples: inputs,
                    Scripts: loadScripts,
                    Libraries: loadLibs
                }),
            });

            view.webview.onDidReceiveMessage(async message => {
                switch (message.command) {
                    case 'sampleRequestSelected':
                        console.log('selected the following sample:');
                        console.log(message.value);
                        const sample = await ResourceFetcher.fetchHostedResource(sampleRequestPath + message.value, resourcePath);
                        console.log(sample);
                        view.webview.postMessage({ command: 'loadedSample', sample: sample });
                        return;
                    case 'invokeLambda':
                        console.log('got the following payload:');
                        console.log(message.value);
                        const lambdaClient = fn.lambda;
                        let funcRequest = {
                            FunctionName: fn.functionConfiguration.FunctionArn!,
                            LogType: 'Tail'
                        } as AWS.Lambda.InvocationRequest;
                        if (message.value) {
                            console.log('found a payload');
                            funcRequest.Payload = message.value;
                        }
                        try {
                            const funcResponse = await lambdaClient.invoke(funcRequest).promise();
                            const logs = funcResponse.LogResult ? Buffer.from(funcResponse.LogResult, 'base64').toString() : "";
                            const payload = funcResponse.Payload ? funcResponse.Payload : JSON.stringify({});
                            view.webview.postMessage({
                                command: 'invokedLambda',
                                logs,
                                payload,
                                statusCode: funcResponse.StatusCode
                            });
                        } catch (e) {
                            view.webview.postMessage({
                                command: 'invokedLambda',
                                error: e
                            });
                        }
                        break;
                }
            }, undefined, ext.context.subscriptions);
        }
        catch (err) {
            console.log('Error getting manifest data..');
            console.log(err);
        }
    }
    catch (err) {
        const ex: AWSError = err;
        console.log(ex.message);
    }
}