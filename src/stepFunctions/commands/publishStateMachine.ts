/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import { AwsContext } from '../../shared/awsContext'
import { StepFunctionsClient } from '../../shared/clients/stepFunctionsClient'
import { ext } from '../../shared/extensionGlobals'
import { getLogger, Logger } from '../../shared/logger'
import {
    DefaultPublishStateMachineWizardContext,
    PublishStateMachineWizard,
    PublishStateMachineWizardContext,
    PublishStateMachineWizardCreateResponse,
    PublishStateMachineWizardResponse,
    PublishStateMachineWizardUpdateResponse,
} from '../wizards/publishStateMachineWizard'

const DEFAULT_REGION: string = 'us-east-1'

export async function publishStateMachine(awsContext: AwsContext, outputChannel: vscode.OutputChannel) {
    const logger: Logger = getLogger()

    const textDocument = vscode.window.activeTextEditor?.document
    if (!textDocument) {
        logger.error('Could not get active text editor for state machine definition')
        throw new Error('Could not get active text editor for state machine definition')
    }

    if (textDocument.languageId === 'asl-yaml') {
        logger.error('Cannot publish state machine from Amazon States Language YAML file')
        throw new Error('Cannot publish state machine from Amazon States Language YAML file')
    }

    let region = awsContext.getCredentialDefaultRegion()
    if (!region) {
        region = DEFAULT_REGION
        logger.info(
            `Default region in credentials profile is not set. Falling back to ${DEFAULT_REGION} for publishing a state machine.`
        )
    }

    const client: StepFunctionsClient = ext.toolkitClientBuilder.createStepFunctionsClient(region)

    try {
        const wizardContext: PublishStateMachineWizardContext = new DefaultPublishStateMachineWizardContext(region)
        const wizardResponse: PublishStateMachineWizardResponse | undefined = await new PublishStateMachineWizard(
            wizardContext
        ).run()
        if (wizardResponse?.createResponse) {
            await createStateMachine(
                wizardResponse.createResponse,
                textDocument.getText(),
                outputChannel,
                region,
                client
            )
        } else if (wizardResponse?.updateResponse) {
            await updateStateMachine(
                wizardResponse.updateResponse,
                textDocument.getText(),
                outputChannel,
                region,
                client
            )
        }
    } catch (err) {
        logger.error(err as Error)
    }
}

async function createStateMachine(
    wizardResponse: PublishStateMachineWizardCreateResponse,
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
                "Successfully created state machine '{0}'",
                wizardResponse.name
            )
        )
        outputChannel.appendLine(result.stateMachineArn)
        logger.info(`Created '${result.stateMachineArn}' successfully`)
        outputChannel.appendLine('')
    } catch (err) {
        outputChannel.appendLine(
            localize(
                'AWS.message.error.stepFunctions.publishStateMachine.createFailure',
                "There was an error creating state machine '{0}', check logs for more information.",
                wizardResponse.name
            )
        )
        logger.error(`Failed to create state machine '${wizardResponse.name}'. %O`, err as Error)
        outputChannel.appendLine('')
    }
}

async function updateStateMachine(
    wizardResponse: PublishStateMachineWizardUpdateResponse,
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
                "Successfully updated state machine '{0}'",
                wizardResponse.stateMachineArn
            )
        )
        logger.info(`Updated ${wizardResponse.stateMachineArn} successfully`)
        outputChannel.appendLine('')
    } catch (err) {
        outputChannel.appendLine(
            localize(
                'AWS.message.error.stepFunctions.publishStateMachine.updateFailure',
                "There was an error updating state machine '{0}', check logs for more information.",
                wizardResponse.stateMachineArn
            )
        )
        logger.error(`Failed to update '${wizardResponse.stateMachineArn}'. %O`, err as Error)
        outputChannel.appendLine('')
    }
}
