/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import * as path from 'path'
import { getTelemetryReason, getTelemetryResult } from '../../shared/errors'
import { RegionProvider } from '../../shared/regions/regionProvider'
import { getLogger } from '../../shared/logger/logger'
import globals from '../../shared/extensionGlobals'
import { checklogs } from '../../shared/localizedText'
import { Result, telemetry } from '../../shared/telemetry/telemetry'
import { CreateServerlessLandWizard } from '../appBuilder/wizards/serverlessLandWizard'
import { ExtContext } from '../../shared/extensions'
import { addFolderToWorkspace } from '../../shared/utilities/workspaceUtils'

export const readmeFile: string = 'README.md'

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
    } catch (err) {
        createResult = getTelemetryResult(err)
        reason = getTelemetryReason(err)

        globals.outputChannel.show(true)
        getLogger().error(
            localize(
                'AWS.serverlessland.initWizard.general.error',
                'Error creating new SAM Application. {0}',
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
