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
import { getLogger } from '../../shared/logger'
import { getSamCliContext, SamCliContext } from '../../shared/sam/cli/samCliContext'
import { runSamCliInit, SamCliInitArgs } from '../../shared/sam/cli/samCliInit'
import { throwAndNotifyIfInvalid } from '../../shared/sam/cli/samCliValidationUtils'
import { SamCliValidator } from '../../shared/sam/cli/samCliValidator'
import { recordSamInit, Result, Runtime } from '../../shared/telemetry/telemetry'
import { makeCheckLogsMessage } from '../../shared/utilities/messages'
import { ChannelLogger } from '../../shared/utilities/vsCodeUtils'
import { addFolderToWorkspace } from '../../shared/utilities/workspaceUtils'
import { getDependencyManager } from '../models/samLambdaRuntime'
import {
    CreateNewSamAppWizard,
    CreateNewSamAppWizardResponse,
    DefaultCreateNewSamAppWizardContext
} from '../wizards/samInitWizard'

export async function resumeCreateNewSamApp(activationLaunchPath: ActivationLaunchPath = new ActivationLaunchPath()) {
    try {
        const pathToLaunch = activationLaunchPath.getLaunchPath()
        if (!pathToLaunch) {
            return
        }

        const uri = vscode.Uri.file(pathToLaunch)
        if (!vscode.workspace.getWorkspaceFolder(uri)) {
            // This should never happen, as `pathToLaunch` will only be set if `uri` is in
            // the newly added workspace folder.
            vscode.window.showErrorMessage(
                localize(
                    'AWS.samcli.initWizard.source.error.notInWorkspace',
                    "Could not open file '{0}'. If this file exists on disk, try adding it to your workspace.",
                    uri.fsPath
                )
            )

            return
        }

        await vscode.window.showTextDocument(uri)
    } finally {
        activationLaunchPath.clearLaunchPath()
    }
}

export interface CreateNewSamApplicationResults {
    runtime: string
    result: Result
}

type createReason = 'unknown' | 'userCancelled' | 'fileNotFound' | 'complete' | 'error'

/**
 * Runs `sam init` in the given context and returns useful metadata about its invocation
 */
export async function createNewSamApplication(
    channelLogger: ChannelLogger,
    samCliContext: SamCliContext = getSamCliContext(),
    activationLaunchPath: ActivationLaunchPath = new ActivationLaunchPath()
): Promise<void> {
    let createResult: Result = 'Succeeded'
    let reason: createReason = 'unknown'
    let createRuntime: Runtime | undefined
    let config: CreateNewSamAppWizardResponse | undefined

    let initArguments: SamCliInitArgs

    try {
        await validateSamCli(samCliContext.validator)

        const wizardContext = new DefaultCreateNewSamAppWizardContext()
        config = await new CreateNewSamAppWizard(wizardContext).run()
        if (!config) {
            createResult = 'Cancelled'
            reason = 'userCancelled'

            return
        }

        // This cast (and all like it) will always succeed because Runtime (from config.runtime) is the same
        // section of types as Runtime
        createRuntime = config.runtime as Runtime

        // TODO: Make this selectable in the wizard to account for runtimes with multiple dependency managers
        const dependencyManager = getDependencyManager(config.runtime)

        initArguments = {
            name: config.name,
            location: config.location.fsPath,
            runtime: config.runtime,
            dependencyManager
        }

        await runSamCliInit(initArguments, samCliContext)

        const uri = await getMainUri(config)
        if (!uri) {
            reason = 'fileNotFound'

            return
        }

        // In case adding the workspace folder triggers a VS Code restart, instruct extension to
        // launch app file after activation.
        activationLaunchPath.setLaunchPath(uri.fsPath)
        await addWorkspaceFolder({
            uri: config.location,
            name: path.basename(config.location.fsPath)
        })

        await vscode.window.showTextDocument(uri)
        activationLaunchPath.clearLaunchPath()

        reason = 'complete'
    } catch (err) {
        createResult = 'Failed'
        reason = 'error'

        const checkLogsMessage = makeCheckLogsMessage()

        channelLogger.channel.show(true)
        channelLogger.error(
            'AWS.samcli.initWizard.general.error',
            'An error occurred while creating a new SAM Application. {0}',
            checkLogsMessage
        )

        getLogger().error('Error creating new SAM Application', err as Error)

        // An error occured, so do not try to open any files during the next extension activation
        activationLaunchPath.clearLaunchPath()
    } finally {
        recordSamInit({
            result: createResult,
            reason: reason,
            runtime: createRuntime,
            name: config?.name
        })
    }
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
        vscode.window.showWarningMessage(
            localize(
                'AWS.samcli.initWizard.source.error.notFound',
                'Project created successfully, but main source code file not found: {0}',
                samTemplatePath
            )
        )
    }
}

async function addWorkspaceFolder(folder: { uri: vscode.Uri; name?: string }): Promise<void> {
    // No-op if the folder is already in the workspace.
    if (vscode.workspace.getWorkspaceFolder(folder.uri)) {
        return
    }

    await addFolderToWorkspace(folder)
}
