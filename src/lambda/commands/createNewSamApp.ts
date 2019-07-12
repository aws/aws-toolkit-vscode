/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as path from 'path'
import * as vscode from 'vscode'
import { ActivationLaunchPath } from '../../shared/activationLaunchPath'
import { fileExists } from '../../shared/filesystemUtilities'
import { getSamCliContext, SamCliContext } from '../../shared/sam/cli/samCliContext'
import { runSamCliInit, SamCliInitArgs } from '../../shared/sam/cli/samCliInit'
import { throwAndNotifyIfInvalid } from '../../shared/sam/cli/samCliValidationUtils'
import { SamCliValidator } from '../../shared/sam/cli/samCliValidator'
import { METADATA_FIELD_NAME, MetadataResult } from '../../shared/telemetry/telemetryTypes'
import { makeCheckLogsMessage } from '../../shared/utilities/messages'
import { ChannelLogger } from '../../shared/utilities/vsCodeUtils'
import { addFolderToWorkspace } from '../../shared/utilities/workspaceUtils'
import {
    CreateNewSamAppWizard,
    CreateNewSamAppWizardResponse,
    DefaultCreateNewSamAppWizardContext
} from '../wizards/samInitWizard'

export async function resumeCreateNewSamApp(
    activationLaunchPath: ActivationLaunchPath = new ActivationLaunchPath()
) {
    try {
        const pathToLaunch = activationLaunchPath.getLaunchPath()
        if (!pathToLaunch) {
            return
        }

        const uri = vscode.Uri.file(pathToLaunch)
        if (!vscode.workspace.getWorkspaceFolder(uri)) {
            // This should never happen, as `pathToLaunch` will only be set if `uri` is in
            // the newly added workspace folder.
            vscode.window.showErrorMessage(localize(
                'AWS.samcli.initWizard.source.error.notInWorkspace',
                'Could not open file \'{0}\'. If this file exists on disk, try adding it to your workspace.',
                uri.fsPath
            ))

            return
        }

        await vscode.window.showTextDocument(uri)
    } finally {
        activationLaunchPath.clearLaunchPath()
    }
}

export interface CreateNewSamApplicationResults {
    reason: 'unknown' | 'userCancelled' | 'fileNotFound' | 'complete' | 'error'
    result: 'pass' | 'fail' | 'cancel',
    runtime: string
}

/**
 * Runs `sam init` in the given context and returns useful metadata about its invocation
 */
export async function createNewSamApplication(
    channelLogger: ChannelLogger,
    extensionContext: Pick<vscode.ExtensionContext, 'asAbsolutePath' | 'globalState'>,
    samCliContext: SamCliContext = getSamCliContext(),
    activationLaunchPath: ActivationLaunchPath = new ActivationLaunchPath(),
): Promise<CreateNewSamApplicationResults> {
    const results: CreateNewSamApplicationResults = {
        reason: 'unknown',
        result: 'fail',
        runtime: 'unknown',
    }

    try {
        await validateSamCli(samCliContext.validator)

        const wizardContext = new DefaultCreateNewSamAppWizardContext(extensionContext)
        const config: CreateNewSamAppWizardResponse | undefined = await new CreateNewSamAppWizard(wizardContext).run()
        if (!config) {
            results.result = 'cancel'
            results.reason = 'userCancelled'

            return results
        }

        results.runtime = config.runtime

        const initArguments: SamCliInitArgs = {
            name: config.name,
            location: config.location.fsPath,
            runtime: config.runtime,
        }
        await runSamCliInit(initArguments, samCliContext.invoker)

        results.result = 'pass'

        const uri = await getMainUri(config)
        if (!uri) {
            results.reason = 'fileNotFound'

            return results
        }

        // In case adding the workspace folder triggers a VS Code restart, instruct extension to
        // launch app file after activation.
        activationLaunchPath.setLaunchPath(uri.fsPath)
        await addWorkspaceFolder(
            {
                uri: config.location,
                name: path.basename(config.location.fsPath)
            },
        )

        await vscode.window.showTextDocument(uri)
        activationLaunchPath.clearLaunchPath()

        results.reason = 'complete'
    } catch (err) {
        const checkLogsMessage = makeCheckLogsMessage()

        channelLogger.channel.show(true)
        channelLogger.error(
            'AWS.samcli.initWizard.general.error',
            'An error occurred while creating a new SAM Application. {0}',
            checkLogsMessage
        )

        const error = err as Error
        channelLogger.logger.error(error)
        results.result = 'fail'
        results.reason = 'error'

        // An error occured, so do not try to open any files during the next extension activation
        activationLaunchPath.clearLaunchPath()
    }

    return results
}

async function validateSamCli(samCliValidator: SamCliValidator): Promise<void> {
    const validationResult = await samCliValidator.detectValidSamCli()
    throwAndNotifyIfInvalid(validationResult)
}

async function getMainUri(
    config: Pick<CreateNewSamAppWizardResponse, 'location' | 'name'>
): Promise<vscode.Uri | undefined> {
    const samTemplatePath = path.resolve(config.location.fsPath, config.name, 'template.yaml')
    if (await fileExists(samTemplatePath)) {
        return vscode.Uri.file(samTemplatePath)
    } else {
        vscode.window.showWarningMessage(localize(
            'AWS.samcli.initWizard.source.error.notFound',
            'Project created successfully, but main source code file not found: {0}',
            samTemplatePath
        ))
    }
}

async function addWorkspaceFolder(
    folder: {
        uri: vscode.Uri,
        name?: string
    },
): Promise<void> {
    // No-op if the folder is already in the workspace.
    if (vscode.workspace.getWorkspaceFolder(folder.uri)) {
        return
    }

    await addFolderToWorkspace(folder)
}

export function applyResultsToMetadata(createResults: CreateNewSamApplicationResults, metadata: Map<string, string>) {
    let metadataResult: MetadataResult

    switch (createResults.result) {
        case 'pass':
            metadataResult = MetadataResult.Pass
            break
        case 'cancel':
            metadataResult = MetadataResult.Cancel
            break
        case 'fail':
        default:
            metadataResult = MetadataResult.Fail
            break
    }

    metadata.set('runtime', createResults.runtime)
    metadata.set(METADATA_FIELD_NAME.RESULT, metadataResult.toString())
    metadata.set(METADATA_FIELD_NAME.REASON, createResults.reason)
}
