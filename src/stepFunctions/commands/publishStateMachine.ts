/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { load } from 'js-yaml'
const localize = nls.loadMessageBundle()
import { AwsContext } from '../../shared/awsContext'
import { StepFunctionsClient } from '../../shared/clients/stepFunctionsClient'
import { showErrorWithLogs } from '../../shared/utilities/messages'
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

import { VALID_SFN_PUBLISH_FORMATS, YAML_FORMATS } from '../constants/aslFormats'

export async function publishStateMachine(awsContext: AwsContext, outputChannel: vscode.OutputChannel) {
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

            logger.error(error)
            showErrorWithLogs(localizedMsg)
            return
        }
    }

    const region = awsContext.getCredentialDefaultRegion()

    const client: StepFunctionsClient = ext.toolkitClientBuilder.createStepFunctionsClient(region)

    try {
        const wizardContext: PublishStateMachineWizardContext = new DefaultPublishStateMachineWizardContext(region)
        const wizardResponse: PublishStateMachineWizardResponse | undefined = await new PublishStateMachineWizard(
            wizardContext
        ).run()
        if (wizardResponse?.createResponse) {
            await createStateMachine(wizardResponse.createResponse, text, outputChannel, region, client)
        } else if (wizardResponse?.updateResponse) {
            await updateStateMachine(wizardResponse.updateResponse, text, outputChannel, region, client)
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
        const msg = localize(
            'AWS.message.error.stepFunctions.publishStateMachine.createFailure',
            'Failed to create state machine: {0}',
            wizardResponse.name
        )
        showErrorWithLogs(msg)
        outputChannel.appendLine(msg)
        outputChannel.appendLine('')
        logger.error(`Failed to create state machine '${wizardResponse.name}': %O`, err as Error)
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
        const msg = localize(
            'AWS.message.error.stepFunctions.publishStateMachine.updateFailure',
            'Failed to update state machine: {0}',
            wizardResponse.stateMachineArn
        )
        showErrorWithLogs(msg)
        outputChannel.appendLine(msg)
        outputChannel.appendLine('')
        logger.error(`Failed to update state machine '${wizardResponse.stateMachineArn}': %O`, err as Error)
    }
}
