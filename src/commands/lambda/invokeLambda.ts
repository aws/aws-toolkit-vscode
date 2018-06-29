import { FunctionNode } from "../../lambda/functionNode";
import { listLambdas } from "./listLambdas";
import { quickPickLambda } from "../../shared/util/quickPickLambda";
import { BaseTemplates } from "../../shared/templates/baseTemplates";
import * as vscode from 'vscode';
import _ = require("lodash");
import { ext } from "../../shared/extensionGlobals";
import { LambdaTemplates } from "../../shared/templates/lambdaTemplates";
import { AWSError } from "aws-sdk";

export async function invokeLambda(element?: FunctionNode) {
    let fn: FunctionNode;
    try {
        if (element && element.functionConfiguration) {
            console.log('found an element to work with...');
            fn = element;
        } else {
            console.log('need to prompt for lambda');
            // might want to work on a cache to reduce calls to AWS.
            const lambdas = await listLambdas();
            // used to show a list of lambdas and allow user to select.
            // this is useful for calling commands from the command palette 
            const selection = await quickPickLambda(lambdas);
            if (selection && selection.functionConfiguration) {
                fn = selection;
            } else {
                throw new Error('No lambda found.');
            }
        }
        
        const view = vscode.window.createWebviewPanel('html', `Invoked ${fn.functionConfiguration.FunctionName}`, -1);

        const baseTemplateFn = _.template(BaseTemplates.SimpleHTML);
        view.webview.html = baseTemplateFn({ content: `<h1>Loading...</h1>` });

        const funcResponse = await ext.lambdaClient.invoke({ FunctionName: fn.functionConfiguration.FunctionArn!, LogType: 'Tail' }).promise();
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