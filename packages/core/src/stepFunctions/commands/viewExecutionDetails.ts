/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { AwsContext } from '../../shared/awsContext'
import { ExecutionDetailProvider } from '../executionDetails/executionDetailProvider'
import { ViewExecutionDetailsWizard } from '../wizards/viewExecutionDetailsWizard'

const localize = nls.loadMessageBundle()

interface ViewExecutionDetailsParams {
    awsContext: AwsContext
    outputChannel: vscode.OutputChannel
}

export async function viewExecutionDetails(params: ViewExecutionDetailsParams): Promise<void> {
    try {
        const wizard = new ViewExecutionDetailsWizard()
        const wizardResponse = await wizard.run()

        if (wizardResponse) {
            const { executionArn, startTime } = wizardResponse

            await ExecutionDetailProvider.openExecutionDetails(executionArn, startTime)
        }
    } catch (error) {
        const errorMessage = localize(
            'AWS.stepFunctions.viewExecutionDetails.error.general',
            'Failed to view execution details'
        )

        params.outputChannel.appendLine('')
        params.outputChannel.appendLine(errorMessage)
        params.outputChannel.show()
    }
}
