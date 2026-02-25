/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import fs from '../shared/fs/fs'
import { getLogger } from '../shared/logger/logger'
import { telemetry } from '../shared/telemetry/telemetry'
import { agentsFile, contextFile, importStatement, notificationMessage, promptMessage } from './shared/constants'
import { extractAccountIdFromResourceMetadata } from './shared/smusUtils'
import { getResourceMetadata } from './shared/utils/resourceMetadataUtils'
import { SmusAuthenticationProvider } from './auth/providers/smusAuthenticationProvider'

function notifyContextUpdated(): void {
    void vscode.window.showInformationMessage(notificationMessage)
}

async function promptUserToAddSmusContext(accountId: string, domainId: string | undefined): Promise<boolean> {
    const metadata = getResourceMetadata()
    const region = metadata?.AdditionalMetadata?.DataZoneDomainRegion
    const projectId = metadata?.AdditionalMetadata?.DataZoneProjectId
    const spaceKey = metadata?.SpaceName
    const authProvider = SmusAuthenticationProvider.fromContext()

    // Extract project account ID and region from ResourceArn
    // ARN format: arn:aws:sagemaker:region:account-id:space/domain-id/space-name
    const arnParts = metadata?.ResourceArn?.split(':')
    const projectRegion = arnParts?.[3]
    const projectAccountId = arnParts?.[4]

    const commonFields = {
        smusDomainId: domainId,
        smusDomainAccountId: accountId,
        smusDomainRegion: region,
        smusProjectId: projectId,
        smusProjectAccountId: projectAccountId,
        smusProjectRegion: projectRegion,
        smusSpaceKey: spaceKey,
        smusAuthMode: authProvider.activeConnection?.type,
        passive: true,
    }

    telemetry.smus_agentContextShowPrompt.emit({
        ...commonFields,
    })

    return telemetry.smus_agentContextUserChoice.run(async () => {
        const choice = await vscode.window.showWarningMessage(promptMessage, 'Yes', 'No')
        if (choice === 'Yes') {
            telemetry.record({ smusAcceptAgentContextAction: 'accepted', ...commonFields })
        } else if (choice === 'No') {
            telemetry.record({ smusAcceptAgentContextAction: 'declined', ...commonFields })
        } else {
            telemetry.record({ smusAcceptAgentContextAction: 'dismissed', ...commonFields })
        }
        return choice === 'Yes'
    })
}

/**
 * Creates or updates ~/smus-context.md with SageMaker Unified Studio context,
 * and ensures ~/AGENTS.md imports it.
 *
 * Behavior:
 * - If AGENTS.md doesn't exist, prompts the user. If accepted, creates both files.
 * - If AGENTS.md exists with the import, silently updates smus-context.md.
 * - If AGENTS.md exists without the import, and smus-context.md already exists,
 *   silently updates smus-context.md (user removed the import, respect that).
 * - If AGENTS.md exists without the import, and smus-context.md doesn't exist,
 *   prompts the user. If accepted, creates smus-context.md and adds the import.
 *   If declined, does nothing.
 *
 * Failures are logged but do not throw.
 */
export async function createAgentsFile(ctx: vscode.ExtensionContext): Promise<void> {
    const logger = getLogger('smus')

    try {
        const templatePath = ctx.asAbsolutePath(path.join('resources', 'smus-context-template.md'))
        const content = await fs.readFileText(templatePath)

        const contextFileExists = await fs.existsFile(contextFile)
        const agentsFileExists = await fs.existsFile(agentsFile)
        const accountId = await extractAccountIdFromResourceMetadata()
        const metadata = getResourceMetadata()

        // Domain ID (DataZone)
        const domainId = metadata?.AdditionalMetadata?.DataZoneDomainId

        if (!agentsFileExists) {
            logger.info('Adding new AGENTS.md file')
            if (!(await promptUserToAddSmusContext(accountId, domainId))) {
                logger.info('User declined adding SageMaker context')
                return
            }
            await fs.writeFile(contextFile, content)
            await fs.writeFile(agentsFile, importStatement + '\n')
            logger.info(`Created ${contextFile} and ${agentsFile}`)
            notifyContextUpdated()
            return
        }

        const agentsContent = await fs.readFileText(agentsFile)

        if (agentsContent.includes(importStatement)) {
            logger.info('AGENTS.md contains import for SMUS context')
            // Already imported — just update the context file
            await fs.writeFile(contextFile, content)
            logger.info(`Updated ${contextFile}`)
            return
        }

        if (contextFileExists) {
            // smus-context.md exists but isn't imported — user removed it, respect that
            // Still update the context file in case they reference it elsewhere
            await fs.writeFile(contextFile, content)
            logger.info(`Updated ${contextFile}, skipping AGENTS.md (user removed import)`)
            notifyContextUpdated()
            return
        }

        // AGENTS.md exists, no import, no smus-context.md — prompt
        if (!(await promptUserToAddSmusContext(accountId, domainId))) {
            logger.info('User declined adding SageMaker context')
            return
        }

        await fs.writeFile(contextFile, content)
        const separator = agentsContent.endsWith('\n') ? '\n' : '\n\n'
        await fs.writeFile(agentsFile, agentsContent + separator + importStatement + '\n')
        logger.info(`Created ${contextFile} and added import to ${agentsFile}`)
        notifyContextUpdated()
    } catch (err) {
        logger.warn(`Failed to create/update AGENTS.md: ${err}`)
    }
}
