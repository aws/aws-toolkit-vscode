/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { load } from 'js-yaml'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { AwsContext } from '../../shared/awsContext'
import { DefaultStepFunctionsClient, StepFunctionsClient } from '../../shared/clients/stepFunctionsClient'
import { getLogger, Logger } from '../../shared/logger'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { VALID_SFN_PUBLISH_FORMATS, YAML_FORMATS } from '../constants/aslFormats'
import { refreshStepFunctionsTree } from '../explorer/stepFunctionsNodes'
import { PublishStateMachineWizard, PublishStateMachineWizardState } from '../wizards/publishStateMachineWizard'
const localize = nls.loadMessageBundle()

export async function publishStateMachine(
    awsContext: AwsContext,
    outputChannel: vscode.OutputChannel,
    region: string | undefined
) {
    const logger: Logger = getLogger()

    const textDocument = vscode.window.activeTextEditor?.document

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
                'AWS.message.error.stepFunctions.publishStateMachine.invalidYAML',
                'Cannot publish invalid YAML file'
            )

            logger.error(error as Error)
            void showViewLogsMessage(localizedMsg)
            return
        }
    }

    try {
        const response = await new PublishStateMachineWizard(region).run()
        if (!response) {
            return
        }
        const client = new DefaultStepFunctionsClient(response.region)

        if (response?.createResponse) {
            await createStateMachine(response.createResponse, text, outputChannel, response.region, client)
            refreshStepFunctionsTree(response.region)
        } else if (response?.updateResponse) {
            await updateStateMachine(response.updateResponse, text, outputChannel, response.region, client)
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
    outputChannel.appendLine(
        localize(
            'AWS.message.info.stepFunctions.publishStateMachine.creating',
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
                'AWS.message.info.stepFunctions.publishStateMachine.createSuccess',
                'Created state machine "{0}"',
                wizardResponse.name
            )
        )
        outputChannel.appendLine(result.stateMachineArn)
        logger.info(`Created "${result.stateMachineArn}"`)
        outputChannel.appendLine('')
    } catch (err) {
        const msg = localize(
            'AWS.message.error.stepFunctions.publishStateMachine.createFailure',
            'Failed to create state machine: {0}',
            wizardResponse.name
        )
        void showViewLogsMessage(msg)
        outputChannel.appendLine(msg)
        outputChannel.appendLine('')
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
    outputChannel.appendLine(
        localize(
            'AWS.message.info.stepFunctions.publishStateMachine.updating',
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
                'AWS.message.info.stepFunctions.publishStateMachine.updateSuccess',
                'Updated state machine: {0}',
                wizardResponse.stateMachineArn
            )
        )
        logger.info(`Updated ${wizardResponse.stateMachineArn}`)
        outputChannel.appendLine('')
    } catch (err) {
        const msg = localize(
            'AWS.message.error.stepFunctions.publishStateMachine.updateFailure',
            'Failed to update state machine: {0}',
            wizardResponse.stateMachineArn
        )
        void showViewLogsMessage(msg)
        outputChannel.appendLine(msg)
        outputChannel.appendLine('')
        logger.error(`Failed to update state machine '${wizardResponse.stateMachineArn}': %O`, err as Error)
    }
}
