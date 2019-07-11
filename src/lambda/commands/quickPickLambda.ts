/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { Lambda } from 'aws-sdk'
import * as vscode from 'vscode'
import { FunctionNodeBase } from '../explorer/functionNode'

class QuickPickLambda extends FunctionNodeBase implements vscode.QuickPickItem {
    public description?: string | undefined
    public detail?: string | undefined
    public picked?: boolean | undefined

    public constructor(configuration: Lambda.FunctionConfiguration, public readonly regionCode: string) {
        super(
            configuration,
            // TODO : This class is ultimately used by selectLambdaNode, which is no longer
            // required, because the commands that use it no longer use optional params.
            // Phase out.
            (relativeExtensionPath: string) => ''
        )
    }

    public get label(): string {
        return super.label!
    }
}

export async function quickPickLambda(
    lambdas: Lambda.FunctionConfiguration[],
    region: string
): Promise<FunctionNodeBase | undefined> {
    try {
        if (!lambdas || lambdas.length === 0) {
            vscode.window.showInformationMessage(localize(
                'AWS.explorerNode.lambda.noFunctions',
                '[no functions in this region]'
            ))
        } else {
            const qpLambdas = lambdas.map(lambda => new QuickPickLambda(lambda, region))

            return await vscode.window.showQuickPick(qpLambdas, { placeHolder: 'Choose a lambda' })
        }
        throw new Error('No lambdas to work with.')
    } catch (error) {
        vscode.window.showErrorMessage('Unable to connect to AWS.')
    }
}
