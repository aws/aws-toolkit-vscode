/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import * as path from 'path'
// import * as vscode from 'vscode'
import { getTelemetryResult, RegionProvider } from '../../shared'
import { getLogger } from '../../shared/logger'
import globals from '../../shared/extensionGlobals'
import { checklogs } from '../../shared/localizedText'
// import { fileExists } from '../../shared/filesystemUtilities'
// import { CreateServerlessLandWizardForm } from '../appBuilder/wizards/serverlessLandWizard'
import { Result, telemetry } from '../../shared/telemetry/telemetry'
import { CreateServerlessLandWizard } from '../appBuilder/wizards/serverlessLandWizard'
import { ExtContext } from '../../shared/extensions'
import { addFolderToWorkspace } from '../../shared/utilities/workspaceUtils'

export const readmeFile: string = 'README.md'

// export async function getProjectUri(
//     config: Pick<CreateServerlessLandWizardForm, 'location' | 'name'>,
//     files: string
// ): Promise<vscode.Uri | undefined> {
//     if (files.length === 0) {
//         throw Error('expected "files" parameter to have at least one item')
//     }
//     let file: string
//     let cfnTemplatePath: string
//     for (const f of files) {
//         file = f
//         cfnTemplatePath = path.resolve(config.location.fsPath, config.name, file)
//         if (await fileExists(cfnTemplatePath)) {
//             return vscode.Uri.file(cfnTemplatePath)
//         }
//     }
//     void vscode.window.showWarningMessage(
//         localize(
//             'AWS.samcli.initWizard.source.error.notFound',
//             'Project created successfully, but {0} file not found: {1}',
//             file!,
//             cfnTemplatePath!
//         )
//     )
// }

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
    const awsContext = extContext.awsContext
    const regionProvider: RegionProvider = extContext.regionProvider
    let createResult: Result = 'Succeeded'
    let reason: string | undefined

    try {
        const credentials = await awsContext.getCredentials()
        const schemaRegions = regionProvider
            .getRegions()
            .filter((r) => regionProvider.isServiceInRegion('schemas', r.id))
        const defaultRegion = awsContext.getCredentialDefaultRegion()

        // Launch the project creation wizard
        const config = await new CreateServerlessLandWizard({
            credentials,
            schemaRegions,
            defaultRegion,
        }).run()
        if (!config) {
            createResult = 'Cancelled'
            reason = 'userCancelled'
            return
        }

        // Add the project folder to the workspace
        await addFolderToWorkspace(
            {
                uri: config.location,
                name: path.basename(config.location.fsPath),
            },
            true
        )

        // Verify project creation and locate project files
        // const projectUri = await getProjectUri(config, readmeFile)
        // if (!projectUri) {
        //     reason = 'fileNotFound'

        //     return
        // }

        // Open README.md file
        // const readmeUri = vscode.Uri.file(path.join(path.dirname(projectUri.fsPath), readmeFile))
        // if (await fileExists(readmeUri.fsPath)) {
        //     const document = await vscode.workspace.openTextDocument(readmeUri)
        //     await vscode.window.showTextDocument(document)
        // } else {
        //     getLogger().warn(
        //         localize('AWS.serverlessLand.readme.notFound', 'README.md file not found in the project directory')
        //     )
        // }
    } catch (err) {
        createResult = getTelemetryResult(err)
        reason = getTelemetryResult(err)

        globals.outputChannel.show(true)
        getLogger().error(
            localize('AWS.samcli.initWizard.general.error', 'Error creating new SAM Application. {0}', checklogs())
        )

        getLogger().error('Error creating new SAM Application: %O', err as Error)
    } finally {
        // add telemetry
        telemetry.sam_init.emit({
            result: createResult,
            reason: reason,
        })
    }
}
