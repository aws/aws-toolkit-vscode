/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM } from 'aws-sdk'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import { DefaultSsmDocumentClient, SsmDocumentClient } from '../../shared/clients/ssmDocumentClient'
import { ssmJson, ssmYaml } from '../../shared/constants'

import * as localizedText from '../../shared/localizedText'
import { getLogger, Logger } from '../../shared/logger'
import {
    PublishSSMDocumentAction,
    PublishSSMDocumentWizard,
    PublishSSMDocumentWizardResponse,
} from '../wizards/publishDocumentWizard'
import { showConfirmationMessage } from '../util/util'
import { telemetry } from '../../shared/telemetry/telemetry'
import { Result, SsmOperation } from '../../shared/telemetry/telemetry'

export async function publishSSMDocument(): Promise<void> {
    const logger: Logger = getLogger()

    const textDocument = vscode.window.activeTextEditor?.document
    if (!textDocument) {
        const errorMsg = 'Could not get active text editor for local Systems Manager Document definition'
        logger.error(errorMsg)
        void vscode.window.showErrorMessage(
            localize(
                'AWS.message.error.ssmDocument.publishDocument.could_not_open',
                'Could not get active text editor for local Systems Manager Document definition'
            )
        )
        return
    }

    if (textDocument.languageId !== ssmJson && textDocument.languageId !== ssmYaml) {
        const supportedFormats = [ssmJson, ssmYaml]
        const errorMsg = 'Current editor language does not match the supported formats: ' + supportedFormats.join(', ')
        logger.error(errorMsg)
        void vscode.window.showErrorMessage(
            localize(
                'AWS.message.error.ssmDocument.publishDocument.invalid_format',
                'Current editor language does not match the supported formats: {0}',
                supportedFormats.join(', ')
            )
        )
        return
    }

    try {
        const response = await new PublishSSMDocumentWizard().run()
        if (response?.action === PublishSSMDocumentAction.QuickCreate) {
            await createDocument(response, textDocument)
        } else if (response?.action === PublishSSMDocumentAction.QuickUpdate) {
            await updateDocument(response, textDocument)
        }
    } catch (err) {
        logger.error(err as Error)
    }
}

export async function createDocument(
    wizardResponse: PublishSSMDocumentWizardResponse,
    textDocument: vscode.TextDocument,
    client: SsmDocumentClient = new DefaultSsmDocumentClient(wizardResponse.region)
) {
    let result: Result = 'Succeeded'
    const ssmOperation = wizardResponse.action as SsmOperation

    const logger: Logger = getLogger()
    logger.info(`Creating Systems Manager Document '${wizardResponse.name}'`)

    try {
        const request: SSM.CreateDocumentRequest = {
            Content: textDocument.getText(),
            Name: wizardResponse.name,
            DocumentType: wizardResponse.documentType,
            DocumentFormat: textDocument.languageId === ssmYaml ? 'YAML' : 'JSON',
        }

        const createResult = await client.createDocument(request)
        logger.info(`Created Systems Manager Document: ${JSON.stringify(createResult.DocumentDescription)}`)
        void vscode.window.showInformationMessage(`Created Systems Manager Document: ${wizardResponse.name}`)
    } catch (err) {
        const error = err as Error
        logger.error(`Failed to create Systems Manager Document "${wizardResponse.name}": %s`, error.message)
        result = 'Failed'
        void vscode.window.showErrorMessage(
            `Failed to create Systems Manager Document '${wizardResponse.name}'. \n${error.message}`
        )
    } finally {
        telemetry.ssm_publishDocument.emit({ result, ssmOperation })
    }
}

export async function updateDocument(
    wizardResponse: PublishSSMDocumentWizardResponse,
    textDocument: vscode.TextDocument,
    client: SsmDocumentClient = new DefaultSsmDocumentClient(wizardResponse.region)
) {
    let result: Result = 'Succeeded'
    const ssmOperation = wizardResponse.action as SsmOperation

    const logger: Logger = getLogger()
    logger.info(`Updating Systems Manager Document '${wizardResponse.name}'`)

    try {
        const request: SSM.UpdateDocumentRequest = {
            Content: textDocument.getText(),
            Name: wizardResponse.name,
            DocumentVersion: '$LATEST',
            DocumentFormat: textDocument.languageId === ssmYaml ? 'YAML' : 'JSON',
        }

        const updateResult = await client.updateDocument(request)

        logger.info(`Updated Systems Manager Document: ${JSON.stringify(updateResult.DocumentDescription)}`)
        void vscode.window.showInformationMessage(`Updated Systems Manager Document: ${wizardResponse.name}`)

        const isConfirmed = await showConfirmationMessage({
            prompt: localize(
                'AWS.ssmDocument.publishDocument.updateVersion.prompt',
                'Would you like to make this the default version for {0}?',
                wizardResponse.name
            ),
            confirm: localizedText.yes,
            cancel: localizedText.no,
        })

        if (!isConfirmed) {
            logger.info('Declined update default version on update document success.')
        } else {
            try {
                const documentVersion: string | undefined = updateResult.DocumentDescription?.DocumentVersion
                if (documentVersion !== undefined) {
                    await client.updateDocumentVersion(wizardResponse.name, documentVersion)
                    logger.info('Updated Systems Manager Document default version')
                    void vscode.window.showInformationMessage('Updated Systems Manager Document default version')
                }
            } catch (err) {
                logger.error(
                    `Failed to update Systems Manager Document default version for "${wizardResponse.name}": %s`,
                    (err as Error).message
                )
                void vscode.window.showErrorMessage(
                    `Failed to update Systems Manager Document default version for: ${wizardResponse.name}`
                )
            }
        }
    } catch (err) {
        const error = err as Error
        logger.error(`Failed to update Systems Manager Document '${wizardResponse.name}'. %0`, error)
        result = 'Failed'
        void vscode.window.showErrorMessage(
            `Failed to update Systems Manager Document '${wizardResponse.name}'. \n${error.message}`
        )
    } finally {
        telemetry.ssm_publishDocument.emit({ result, ssmOperation })
    }
}
