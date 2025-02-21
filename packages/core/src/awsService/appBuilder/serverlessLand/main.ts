/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import * as path from 'path'
import * as vscode from 'vscode'
import { getTelemetryReason, getTelemetryResult } from '../../../shared/errors'
import { getLogger } from '../../../shared/logger/logger'
import { checklogs } from '../../../shared/localizedText'
import { Result, telemetry } from '../../../shared/telemetry/telemetry'
import { CreateServerlessLandWizardForm, CreateServerlessLandWizard } from './wizard'
import { ExtContext } from '../../../shared/extensions'
import { addFolderToWorkspace } from '../../../shared/utilities/workspaceUtils'
import { ToolkitError } from '../../../shared/errors'
import { fs } from '../../../shared/fs/fs'
import { getPattern } from '../../../shared/utilities/downloadPatterns'
import { MetadataManager } from './metadataManager'

export const readmeFile: string = 'README.md'
const serverlessLandOwner = 'aws-samples'
const serverlessLandRepo = 'serverless-patterns'

/**
 * Creates a new Serverless Land project using the provided extension context
 * @param extContext Extension context containing AWS credentials and region information
 * @returns Promise that resolves when the project creation is complete
 *
 * This function:
 * 1. Validates AWS credentials and regions
 * 2. Launches the Serverless Land project creation wizard
 * 3. Creates the project structure
 * 4. Adds the project folder to the workspace
 * 5. Opens the README.md file if available
 * 6. Handles errors and emits telemetry
 */
export async function createNewServerlessLandProject(extContext: ExtContext): Promise<void> {
    let createResult: Result = 'Succeeded'
    let reason: string | undefined
    let metadataManager: MetadataManager

    try {
        metadataManager = MetadataManager.getInstance()
        // Launch the project creation wizard
        const config = await launchProjectCreationWizard(extContext)
        if (!config) {
            createResult = 'Cancelled'
            reason = 'userCancelled'
            return
        }
        const assetName = metadataManager.getAssetName(config.pattern, config.runtime, config.iac)

        await downloadPatternCode(config, assetName)
        await openReadmeFile(config)
        await addFolderToWorkspace(
            {
                uri: vscode.Uri.joinPath(config.location, config.name),
                name: path.basename(config.name),
            },
            true
        )
    } catch (err) {
        createResult = getTelemetryResult(err)
        reason = getTelemetryReason(err)
        getLogger().error(
            localize(
                'AWS.serverlessland.initWizard.general.error',
                'Error creating new Serverless Land Application. {0}',
                checklogs()
            )
        )
        getLogger().error('Error creating new Serverless Land Application: %O', err as Error)
    } finally {
        // add telemetry
        // TODO: Will add telemetry once the implementation gets completed
        telemetry.sam_init.emit({
            result: createResult,
            reason: reason,
        })
    }
}

async function launchProjectCreationWizard(
    extContext: ExtContext
): Promise<CreateServerlessLandWizardForm | undefined> {
    const awsContext = extContext.awsContext
    const credentials = await awsContext.getCredentials()
    const defaultRegion = awsContext.getCredentialDefaultRegion()

    return new CreateServerlessLandWizard({
        credentials,
        defaultRegion,
    }).run()
}

async function downloadPatternCode(config: CreateServerlessLandWizardForm, assetName: string): Promise<void> {
    const fullAssetName = assetName + '.zip'
    const location = vscode.Uri.joinPath(config.location, config.name)
    try {
        await getPattern(serverlessLandOwner, serverlessLandRepo, fullAssetName, location, true)
    } catch (error) {
        if (error instanceof ToolkitError) {
            throw error
        }
        throw new ToolkitError(`Failed to download pattern: ${error}`)
    }
}

async function openReadmeFile(config: CreateServerlessLandWizardForm): Promise<void> {
    try {
        const readmeUri = await getProjectUri(config, readmeFile)
        if (!readmeUri) {
            getLogger().warn('README.md file not found in the project directory')
            return
        }

        await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup')
        await vscode.window.showTextDocument(readmeUri)
    } catch (err) {
        getLogger().error(`Error in openReadmeFile: ${err}`)
        throw new ToolkitError('Error processing README file')
    }
}

async function getProjectUri(
    config: Pick<CreateServerlessLandWizardForm, 'location' | 'name'>,
    file: string
): Promise<vscode.Uri | undefined> {
    if (!file) {
        throw Error('expected "file" parameter to have at least one item')
    }
    const cfnTemplatePath = path.resolve(config.location.fsPath, config.name, file)
    if (await fs.exists(cfnTemplatePath)) {
        return vscode.Uri.file(cfnTemplatePath)
    }
    void vscode.window.showWarningMessage(
        localize(
            'AWS.serverlessLand.initWizard.source.error.notFound',
            'Project created successfully, but {0} file not found: {1}',
            file!,
            cfnTemplatePath!
        )
    )
}
