/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM } from 'aws-sdk'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import { AwsContext } from '../../shared/awsContext'
import { SsmDocumentClient } from '../../shared/clients/ssmDocumentClient'
import { ext } from '../../shared/extensionGlobals'
import { getLogger, Logger } from '../../shared/logger'
import {
    DefaultPublishSSMDocumentWizardContext,
    PublishSSMDocumentWizard,
    PublishSSMDocumentWizardContext,
    PublishSSMDocumentWizardResponse,
} from '../wizards/publishDocumentWizard'
import { stringify } from 'querystring'
import * as telemetry from '../../shared/telemetry/telemetry'

const DEFAULT_REGION: string = 'us-east-1'

export async function publishSSMDocument(awsContext: AwsContext, outputChannel: vscode.OutputChannel): Promise<void> {
    const logger: Logger = getLogger()

    const textDocument = vscode.window.activeTextEditor?.document
    if (!textDocument) {
        logger.error('Could not get active text editor for local SSM Document definition')
        throw new Error('Could not get active text editor for local SSM Document definition')
    }

    if (textDocument.languageId !== 'ssm-json' && textDocument.languageId !== 'ssm-yaml') {
        logger.error(
            'Could not get SSM Document from current active text editor. Please set the document language to ssm-yaml or ssm-json.'
        )
        throw new Error('Could not get active text editor for local SSM Document definition')
    }

    let region = awsContext.getCredentialDefaultRegion()
    if (!region) {
        region = DEFAULT_REGION
        logger.info(
            `Default region in credentials profile is not set. Falling back to ${DEFAULT_REGION} for publishing a SSM Document.`
        )
    }

    const client: SsmDocumentClient = ext.toolkitClientBuilder.createSsmClient(region)

    try {
        const wizardContext: PublishSSMDocumentWizardContext = new DefaultPublishSSMDocumentWizardContext(region)
        const wizardResponse: PublishSSMDocumentWizardResponse | undefined = await new PublishSSMDocumentWizard(
            wizardContext
        ).run()
        if (wizardResponse?.createResponse) {
            await createDocument(wizardResponse, textDocument, outputChannel, region, client)
        } else if (wizardResponse?.updateResponse) {
            await updateDocument(wizardResponse, textDocument, outputChannel, region, client)
        }
    } catch (err) {
        logger.error(err as Error)
    }
}

export async function createDocument(
    wizardResponse: PublishSSMDocumentWizardResponse,
    textDocument: vscode.TextDocument,
    outputChannel: vscode.OutputChannel,
    region: string,
    client: SsmDocumentClient
) {
    const logger: Logger = getLogger()
    logger.info(`Creating SSM Document '${wizardResponse.createResponse!.name}'`)
    outputChannel.show()
    outputChannel.appendLine(
        localize(
            'AWS.message.info.ssmDocument.publishDocument.creating',
            "Creating SSM Document '{0}' in {1}...",
            wizardResponse.createResponse!.name,
            region
        )
    )

    try {
        const request: SSM.CreateDocumentRequest = {
            Content: textDocument.getText(),
            Name: wizardResponse.createResponse!.name,
            DocumentType: wizardResponse.createResponse!.documentType,
            DocumentFormat: textDocument.languageId === 'ssm-yaml' ? 'YAML' : 'JSON',
        }

        const result = await client.createDocument(request)
        outputChannel.appendLine(
            localize(
                'AWS.message.info.ssmDocument.publishDocument.createSuccess',
                "Successfully created and uploaded SSM Document '{0}'",
                wizardResponse.createResponse!.name
            )
        )
        if (result.DocumentDescription) {
            outputChannel.appendLine(stringify(result.DocumentDescription))
        }

        telemetry.recordSsmPublishDocumentCreate({ result: 'Succeeded' })
        logger.info(`Created SSM Document successfully ${stringify(result.DocumentDescription)}`)
        vscode.window.showInformationMessage(`Created SSM Document successfully`)
        outputChannel.appendLine('')
    } catch (err) {
        outputChannel.appendLine(
            localize(
                'AWS.message.info.ssmDocument.publishDocument.createFailure',
                "There was an error creating and uploading SSM Document '{0}', check logs for more information.",
                wizardResponse.createResponse!.name
            )
        )

        telemetry.recordSsmPublishDocumentCreate({ result: 'Failed' })
        logger.info(`Failed to create SSM Document '${wizardResponse.createResponse!.name}'. %0`, err as Error)
        vscode.window.showErrorMessage(
            `Failed to create SSM Document '${wizardResponse.createResponse!.name}'. ${(err as Error).message}`
        )
        outputChannel.appendLine('')
    }
}

export async function updateDocument(
    wizardResponse: PublishSSMDocumentWizardResponse,
    textDocument: vscode.TextDocument,
    outputChannel: vscode.OutputChannel,
    region: string,
    client: SsmDocumentClient
) {
    const logger: Logger = getLogger()
    logger.info(`Updating SSM Document '${wizardResponse.updateResponse!.name}'`)
    outputChannel.show()
    outputChannel.appendLine(
        localize(
            'AWS.message.info.ssmDocument.publishDocument.updating',
            "Updating SSM Document '{0}' in {1}...",
            wizardResponse.updateResponse!.name,
            region
        )
    )

    try {
        const request: SSM.UpdateDocumentRequest = {
            Content: textDocument.getText(),
            Name: wizardResponse.updateResponse!.name,
            DocumentVersion: '$LATEST',
            DocumentFormat: textDocument.languageId === 'ssm-yaml' ? 'YAML' : 'JSON',
        }

        // Add more to request
        const result = await client.updateDocument(request)
        outputChannel.appendLine(
            localize(
                'AWS.message.info.ssmDocument.publishDocument.updateSuccess',
                "Successfully updated SSM Document '{0}'",
                wizardResponse.updateResponse!.name
            )
        )
        if (result.DocumentDescription) {
            outputChannel.appendLine(stringify(result.DocumentDescription))
        }

        telemetry.recordSsmPublishDocumentUpdate({ result: 'Succeeded' })
        vscode.window.showInformationMessage(`Updated SSM Document successfully`)
        logger.info(`Updated SSM Document successfully ${stringify(result.DocumentDescription)}`)
        outputChannel.appendLine('')
    } catch (err) {
        outputChannel.appendLine(
            localize(
                'AWS.message.info.ssmDocument.publishDocument.updateFailure',
                "There was an error updating SSM Document '{0}', check logs for more information.",
                wizardResponse.updateResponse!.name
            )
        )

        telemetry.recordSsmPublishDocumentUpdate({ result: 'Failed' })
        logger.info(`Failed to update SSM Document '${wizardResponse.updateResponse!.name}'. %0`, err as Error)
        outputChannel.appendLine('')
    }
}
