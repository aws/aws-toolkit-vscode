/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { load } from 'js-yaml'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { AwsContext } from '../../shared/awsContext'
import { StepFunctionsClient } from '../../shared/clients/stepFunctions'
import { getLogger, Logger } from '../../shared/logger/logger'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { VALID_SFN_PUBLISH_FORMATS, YAML_FORMATS } from '../constants/aslFormats'
import { refreshStepFunctionsTree } from '../explorer/stepFunctionsNodes'
import { PublishStateMachineWizard, PublishStateMachineWizardState } from '../wizards/publishStateMachineWizard'
const localize = nls.loadMessageBundle()

interface publishStateMachineParams {
    awsContext: AwsContext
    outputChannel: vscode.OutputChannel
    region?: string
    text?: vscode.TextDocument
}
export async function publishStateMachine(params: publishStateMachineParams) {
    const logger: Logger = getLogger()
    let textDocument: vscode.TextDocument | undefined

    if (params.text) {
        textDocument = params.text
    } else {
        textDocument = vscode.window.activeTextEditor?.document
    }

    if (!textDocument) {
        logger.error('Could not get active text editor for state machine definition')
        throw new Error('Could not get active text editor for state machine definition')
    }

    let text = textDocument.getText()

    if (!VALID_SFN_PUBLISH_FORMATS.includes(textDocument.languageId)) {
        const errorMessage = `Cannot publish state machine from "${textDocument.languageId}" file`
        logger.error(errorMessage)
        throw new Error(errorMessage)
    }

    if (YAML_FORMATS.includes(textDocument.languageId)) {
        try {
            text = JSON.stringify(load(text), undefined, '  ')
        } catch (error) {
            const localizedMsg = localize(
                'AWS.stepFunctions.publishStateMachine.error.invalidYAML',
                'Cannot publish invalid YAML file'
            )

            logger.error(error as Error)
            void showViewLogsMessage(localizedMsg)
            return
        }
    }

    try {
        const response = await new PublishStateMachineWizard(params.region).run()
        if (!response) {
            return
        }
        const client = new StepFunctionsClient(response.region)

        if (response?.createResponse) {
            await createStateMachine(response.createResponse, text, params.outputChannel, response.region, client)
            refreshStepFunctionsTree(response.region)
        } else if (response?.updateResponse) {
            await updateStateMachine(response.updateResponse, text, params.outputChannel, response.region, client)
        }
    } catch (err) {
        logger.error(err as Error)
    }
}

async function createStateMachine(
    wizardResponse: NonNullable<PublishStateMachineWizardState['createResponse']>,
    definition: string,
    outputChannel: vscode.OutputChannel,
    region: string,
    client: StepFunctionsClient
) {
    const logger: Logger = getLogger()
    logger.info(`Creating state machine '${wizardResponse.name}'`)
    outputChannel.show()
    outputChannel.appendLine('')
    outputChannel.appendLine(
        localize(
            'AWS.stepFunctions.publishStateMachine.info.creating',
            "Creating state machine '{0}' in {1}...",
            wizardResponse.name,
            region
        )
    )
    try {
        const result = await client.createStateMachine({
            definition,
            name: wizardResponse.name,
            roleArn: wizardResponse.roleArn,
        })
        outputChannel.appendLine(
            localize(
                'AWS.stepFunctions.publishStateMachine.info.createSuccess',
                "Created state machine '{0}'",
                wizardResponse.name
            )
        )
        outputChannel.appendLine(result.stateMachineArn || '')
        logger.info(`Created "${result.stateMachineArn}"`)
    } catch (err) {
        const msg = localize(
            'AWS.stepFunctions.publishStateMachine.error.createFailure',
            'Failed to create state machine: {0}',
            wizardResponse.name
        )
        void showViewLogsMessage(msg)
        outputChannel.appendLine(msg)
        logger.error(`Failed to create state machine '${wizardResponse.name}': %O`, err as Error)
    }
}

async function updateStateMachine(
    wizardResponse: NonNullable<PublishStateMachineWizardState['updateResponse']>,
    definition: string,
    outputChannel: vscode.OutputChannel,
    region: string,
    client: StepFunctionsClient
) {
    const logger: Logger = getLogger()
    logger.info(`Updating state machine ${wizardResponse.stateMachineArn}`)
    outputChannel.show()
    outputChannel.appendLine('')
    outputChannel.appendLine(
        localize(
            'AWS.stepFunctions.publishStateMachine.info.updating',
            "Updating state machine '{0}' in {1}...",
            wizardResponse.stateMachineArn,
            region
        )
    )
    try {
        await client.updateStateMachine({
            definition,
            stateMachineArn: wizardResponse.stateMachineArn,
        })
        outputChannel.appendLine(
            localize(
                'AWS.stepFunctions.publishStateMachine.info.updateSuccess',
                'Updated state machine: {0}',
                wizardResponse.stateMachineArn
            )
        )
        logger.info(`Updated ${wizardResponse.stateMachineArn}`)
    } catch (err) {
        const msg = localize(
            'AWS.stepFunctions.publishStateMachine.error.updateFailure',
            'Failed to update state machine: {0}',
            wizardResponse.stateMachineArn
        )
        void showViewLogsMessage(msg)
        outputChannel.appendLine(msg)
        logger.error(`Failed to update state machine '${wizardResponse.stateMachineArn}': %O`, err as Error)
    }
}
