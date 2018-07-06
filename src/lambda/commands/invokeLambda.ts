'use strict';

import { FunctionNode } from "../explorer/functionNode";
import { getSelectedLambdaNode } from '../utils';
import { BaseTemplates } from "../../shared/templates/baseTemplates";
import * as vscode from 'vscode';
import _ = require("lodash");
import { ext } from "../../shared/extensionGlobals";
import { LambdaTemplates } from "../templates/lambdaTemplates";
import { AWSError } from "aws-sdk";
import Lambda = require('aws-sdk/clients/lambda');

export async function invokeLambda(element?: FunctionNode) {
    try {
        const fn: FunctionNode = await getSelectedLambdaNode(element);

        const view = vscode.window.createWebviewPanel('html', `Invoked ${fn.functionConfiguration.FunctionName}`, -1);
        const baseTemplateFn = _.template(BaseTemplates.SimpleHTML);
        view.webview.html = baseTemplateFn({ content: `<h1>Loading...</h1>` });

        // ideally need to get the client from the explorer, but the context will do for now
        const lambdaClient = await ext.sdkClientBuilder.createAndConfigureSdkClient(Lambda, undefined);
        const funcResponse = await lambdaClient.invoke({ FunctionName: fn.functionConfiguration.FunctionArn!, LogType: 'Tail' }).promise();
        const logs = funcResponse.LogResult ? Buffer.from(funcResponse.LogResult, 'base64') : "";
        const payload = funcResponse.Payload ? funcResponse.Payload : JSON.stringify({});
        const invokeTemplateFn = _.template(LambdaTemplates.InvokeTemplate);

        view.webview.html = baseTemplateFn({
            content: invokeTemplateFn({
                FunctionName: fn.functionConfiguration.FunctionName,
                LogResult: logs,
                StatusCode: funcResponse.StatusCode,
                Payload: payload
            })
        });
    }
    catch (err) {
        const ex: AWSError = err;
        console.log(ex.message);
    }
}