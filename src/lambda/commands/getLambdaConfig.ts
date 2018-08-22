'use strict';

import { FunctionNode } from "../explorer/functionNode";
import * as vscode from 'vscode';
import _ = require("lodash");
import { BaseTemplates } from "../../shared/templates/baseTemplates";
import { LambdaTemplates } from "../templates/lambdaTemplates";
import { AWSError } from "aws-sdk";
import { getSelectedLambdaNode } from "../utils";

export async function getLambdaConfig(element?: FunctionNode) {
    try {
        const fn: FunctionNode = await getSelectedLambdaNode(element);

        const view = vscode.window.createWebviewPanel('html', `Getting config for ${fn.functionConfiguration.FunctionName}`, -1);

        const baseTemplateFn = _.template(BaseTemplates.SimpleHTML);
        view.webview.html = baseTemplateFn({ content: `<h1>Loading...</h1>` });
        const funcResponse = await fn.lambda.getFunctionConfiguration({
            FunctionName: fn.functionConfiguration.FunctionName!
        }).promise();

        const getConfigTemplateFn = _.template(LambdaTemplates.GetConfigTemplate);
        view.webview.html = baseTemplateFn({
            content: getConfigTemplateFn(funcResponse)
        });
    }
    catch (err) {
        const ex: AWSError = err;
        console.log(ex.message);
    }
}