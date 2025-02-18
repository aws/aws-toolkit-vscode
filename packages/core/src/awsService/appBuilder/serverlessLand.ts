/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import * as path from 'path'
import * as vscode from 'vscode'
import { getTelemetryResult, RegionProvider, ToolkitError } from '../../shared'
import { getLogger } from '../../shared/logger'
import { fileExists } from '../../shared/filesystemUtilities'
import { CreateServerlessLandWizardForm } from '../appBuilder/wizards/serverlessLandWizard'
import { Result, telemetry } from '../../shared/telemetry/telemetry'
import { CreateServerlessLandWizard } from '../appBuilder/wizards/serverlessLandWizard'
import { ExtContext } from '../../shared/extensions'
import { addFolderToWorkspace } from '../../shared/utilities/workspaceUtils'
import { getPattern } from '../../shared/utilities/downloadPatterns'

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

    try {
        // Launch the project creation wizard
        const config = await launchProjectCreationWizard(extContext)
        if (!config) {
            createResult = 'Cancelled'
            reason = 'userCancelled'
            return
        }
        await downloadPatternCode(config)
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
        reason = getTelemetryResult(err)
        throw new ToolkitError('Error creating new ServerlessLand Application')
    } finally {
        // add telemetry
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
    const regionProvider: RegionProvider = extContext.regionProvider
    const credentials = await awsContext.getCredentials()
    const schemaRegions = regionProvider.getRegions().filter((r) => regionProvider.isServiceInRegion('schemas', r.id))
    const defaultRegion = awsContext.getCredentialDefaultRegion()

    return new CreateServerlessLandWizard({
        credentials,
        schemaRegions,
        defaultRegion,
    }).run()
}

async function downloadPatternCode(config: CreateServerlessLandWizardForm): Promise<void> {
    const assetName = config.assetName + '.zip'
    const location = vscode.Uri.joinPath(config.location, config.name)
    try {
        await getPattern(serverlessLandOwner, serverlessLandRepo, assetName, location, true)
    } catch (error) {
        if (error instanceof ToolkitError) {
            throw error
        }
        throw new ToolkitError(`Failed to download pattern: ${error}`)
    }
}

async function openReadmeFile(config: CreateServerlessLandWizardForm): Promise<void> {
    try {
        const projectUri = await getProjectUri(config, readmeFile)
        if (!projectUri) {
            getLogger().warn('Project URI not found when trying to open README')
            return
        }

        const readmeUri = vscode.Uri.file(path.join(path.dirname(projectUri.fsPath), readmeFile))
        if (!(await fileExists(readmeUri.fsPath))) {
            getLogger().warn(
                localize('AWS.serverlessLand.readme.notFound', 'README.md file not found in the project directory')
            )
            return
        }

        try {
            const document = await vscode.workspace.openTextDocument(readmeUri)
            await vscode.window.showTextDocument(document, { preview: true })
        } catch (err) {
            getLogger().error(`Failed to open README file: ${err}`)
            throw new ToolkitError('Failed to open README file')
        }
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
    if (await fileExists(cfnTemplatePath)) {
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
