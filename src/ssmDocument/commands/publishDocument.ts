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
import { ssmJson, ssmYaml } from '../../shared/constants'
import { ext } from '../../shared/extensionGlobals'
import { getLogger, Logger } from '../../shared/logger'
import { RegionProvider } from '../../shared/regions/regionProvider'
import { getRegionsForActiveCredentials } from '../../shared/regions/regionUtilities'
import * as picker from '../../shared/ui/picker'
import {
    DefaultPublishSSMDocumentWizardContext,
    PublishSSMDocumentWizard,
    PublishSSMDocumentWizardContext,
    PublishSSMDocumentWizardResponse,
} from '../wizards/publishDocumentWizard'
import { stringify } from 'querystring'
import * as telemetry from '../../shared/telemetry/telemetry'

const DEFAULT_REGION: string = 'us-east-1'

export async function publishSSMDocument(
    awsContext: AwsContext,
    regionProvider: RegionProvider,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    const logger: Logger = getLogger()

    const textDocument = vscode.window.activeTextEditor?.document
    if (!textDocument) {
        let errorMsg = 'Could not get active text editor for local SSM Document definition'
        logger.error(errorMsg)
        vscode.window.showErrorMessage(
            localize(
                'AWS.message.error.ssmDocument.publishDocument.could_not_open',
                'Could not get active text editor for local SSM Document definition'
            )
        )
        return
    }

    if (textDocument.languageId !== ssmJson && textDocument.languageId !== ssmYaml) {
        let supportedFormats = [ssmJson, ssmYaml]
        let errorMsg = 'Current editor language does not match the supported formats: ' + supportedFormats.join(', ')
        logger.error(errorMsg)
        vscode.window.showErrorMessage(
            localize(
                'AWS.message.error.ssmDocument.publishDocument.invalid_format',
                'Current editor language does not match the supported formats: {0}',
                supportedFormats.join(', ')
            )
        )
        return
    }

    let region = await promptUserForRegion(awsContext, regionProvider, awsContext.getCredentialDefaultRegion())
    if (!region) {
        region = DEFAULT_REGION
        logger.info(
            `Unsuccessful in picking a region. Falling back to ${DEFAULT_REGION} for publishing a SSM Document.`
        )
    }

    const client: SsmDocumentClient = ext.toolkitClientBuilder.createSsmClient(region)

    try {
        const wizardContext: PublishSSMDocumentWizardContext = new DefaultPublishSSMDocumentWizardContext(region)
        const wizardResponse: PublishSSMDocumentWizardResponse | undefined = await new PublishSSMDocumentWizard(
            wizardContext
        ).run()
        if (wizardResponse?.PublishSsmDocAction == 'Create') {
            await createDocument(wizardResponse, textDocument, outputChannel, region, client)
        } else if (wizardResponse?.PublishSsmDocAction == 'Update') {
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
    let result: telemetry.Result = 'Succeeded'
    let ssmOperation: telemetry.SsmOperation = wizardResponse.PublishSsmDocAction as telemetry.SsmOperation

    const logger: Logger = getLogger()
    logger.info(`Creating SSM Document '${wizardResponse.name}'`)
    outputChannel.show()
    outputChannel.appendLine(
        localize(
            'AWS.message.info.ssmDocument.publishDocument.creating',
            "Creating SSM Document '{0}' in {1}...",
            wizardResponse.name,
            region
        )
    )

    try {
        const request: SSM.CreateDocumentRequest = {
            Content: textDocument.getText(),
            Name: wizardResponse.name,
            DocumentType: wizardResponse.documentType,
            DocumentFormat: textDocument.languageId === ssmYaml ? 'YAML' : 'JSON',
        }

        const createResult = await client.createDocument(request)
        outputChannel.appendLine(
            localize(
                'AWS.message.info.ssmDocument.publishDocument.createSuccess',
                "Successfully created and uploaded SSM Document '{0}'",
                wizardResponse.name
            )
        )
        if (createResult.DocumentDescription) {
            outputChannel.appendLine(stringify(createResult.DocumentDescription))
        }
        logger.info(`Created SSM Document successfully ${stringify(createResult.DocumentDescription)}`)
        vscode.window.showInformationMessage(`Created SSM Document successfully`)
        outputChannel.appendLine('')
    } catch (err) {
        logger.info(`Failed to create SSM Document '${wizardResponse.name}'. %0`, err as Error)
        result = 'Failed'
        outputChannel.appendLine(
            localize(
                'AWS.message.info.ssmDocument.publishDocument.createFailure',
                "There was an error creating and uploading SSM Document '{0}', check logs for more information.",
                wizardResponse.name
            )
        )
        vscode.window.showErrorMessage(
            `Failed to create SSM Document '${wizardResponse.name}'. ${(err as Error).message}`
        )
        outputChannel.appendLine('')
    } finally {
        telemetry.recordSsmPublishDocument({ result: result, ssmOperation: ssmOperation })
    }
}

export async function updateDocument(
    wizardResponse: PublishSSMDocumentWizardResponse,
    textDocument: vscode.TextDocument,
    outputChannel: vscode.OutputChannel,
    region: string,
    client: SsmDocumentClient
) {
    let result: telemetry.Result = 'Succeeded'
    let ssmOperation: telemetry.SsmOperation = wizardResponse.PublishSsmDocAction as telemetry.SsmOperation

    const logger: Logger = getLogger()
    logger.info(`Updating SSM Document '${wizardResponse.name}'`)
    outputChannel.show()
    outputChannel.appendLine(
        localize(
            'AWS.message.info.ssmDocument.publishDocument.updating',
            "Updating SSM Document '{0}' in {1}...",
            wizardResponse.name,
            region
        )
    )

    try {
        const request: SSM.UpdateDocumentRequest = {
            Content: textDocument.getText(),
            Name: wizardResponse.name,
            DocumentVersion: '$LATEST',
            DocumentFormat: textDocument.languageId === ssmYaml ? 'YAML' : 'JSON',
        }

        const updateResult = await client.updateDocument(request)
        outputChannel.appendLine(
            localize(
                'AWS.message.info.ssmDocument.publishDocument.updateSuccess',
                "Successfully updated SSM Document '{0}'",
                wizardResponse.name
            )
        )
        if (updateResult.DocumentDescription) {
            outputChannel.appendLine(stringify(updateResult.DocumentDescription))
        }
        logger.info(`Updated SSM Document successfully ${stringify(updateResult.DocumentDescription)}`)
        vscode.window.showInformationMessage(`Updated SSM Document successfully`)
        outputChannel.appendLine('')
    } catch (err) {
        logger.info(`Failed to update SSM Document '${wizardResponse.name}'. %0`, err as Error)
        result = 'Failed'
        outputChannel.appendLine(
            localize(
                'AWS.message.info.ssmDocument.publishDocument.updateFailure',
                "There was an error updating SSM Document '{0}', check logs for more information.",
                wizardResponse.name
            )
        )
        outputChannel.appendLine('')
    } finally {
        telemetry.recordSsmPublishDocument({ result: result, ssmOperation: ssmOperation })
    }
}

async function promptUserForRegion(
    awsContext: AwsContext,
    regionProvider: RegionProvider,
    initialRegionCode?: string
): Promise<string | undefined> {
    const partitionRegions = getRegionsForActiveCredentials(awsContext, regionProvider)

    const quickPick = picker.createQuickPick<vscode.QuickPickItem>({
        options: {
            title: localize(
                'AWS.message.prompt.ssmDocument.publishDocument.region',
                'Which AWS Region would you like to publish to?'
            ),
            value: initialRegionCode,
            matchOnDetail: true,
            ignoreFocusOut: true,
        },
        items: partitionRegions.map(region => ({
            label: region.name,
            detail: region.id,
            // this is the only way to get this to show on going back
            // this will make it so it always shows even when searching for something else
            alwaysShow: region.id === initialRegionCode,
            description:
                region.id === initialRegionCode ? localize('AWS.wizard.selectedPreviously', 'Selected Previously') : '',
        })),
        buttons: [vscode.QuickInputButtons.Back],
    })

    const choices = await picker.promptUser<vscode.QuickPickItem>({
        picker: quickPick,
        onDidTriggerButton: (button, resolve, reject) => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve(undefined)
            }
        },
    })
    const val = picker.verifySinglePickerOutput(choices)

    return val?.detail
}
