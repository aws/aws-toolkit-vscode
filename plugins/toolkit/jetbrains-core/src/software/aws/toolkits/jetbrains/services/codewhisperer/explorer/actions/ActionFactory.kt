// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanManager
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginType
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererModelConfigurator
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isUserBuilderId
import software.aws.toolkits.jetbrains.utils.isRunningOnRemoteBackend

interface ActionProvider<T> {
    val pause: T
    val resume: T
    val openCodeReference: T
    val customize: T
    val learn: T
    val openChatPanel: T
    val pauseAutoScans: T
    val resumeAutoScans: T
    val runScan: T
    val stopScan: T
    val sendFeedback: T
    val connectOnGithub: T
    val documentation: T
}

fun<T> buildActionListForInlineSuggestions(project: Project, actionProvider: ActionProvider<T>): List<T> {
    val manager = CodeWhispererExplorerActionManager.getInstance()
    val activeConnectionType = manager.checkActiveCodeWhispererConnectionType(project)

    return buildList {
        if (manager.isAutoEnabled()) {
            add(actionProvider.pause)
        } else {
            add(actionProvider.resume)
        }

        add(actionProvider.openCodeReference)

        // We only show this customization node to SSO users who are in CodeWhisperer Gated Preview list
        if (activeConnectionType == CodeWhispererLoginType.SSO &&
            CodeWhispererModelConfigurator.getInstance().shouldDisplayCustomNode(project)
        ) {
            add(actionProvider.customize)
        }

        add(actionProvider.learn)
    }
}

fun<T> buildActionListForCodeScan(project: Project, actionProvider: ActionProvider<T>): List<T> =
    buildList {
        if (!isRunningOnRemoteBackend()) {
            add(actionProvider.openChatPanel)
        }
        val codeScanManager = CodeWhispererCodeScanManager.getInstance(project)
        val manager = CodeWhispererExplorerActionManager.getInstance()
        if (!isUserBuilderId(project)) {
            if (manager.isAutoEnabledForCodeScan()) {
                add(actionProvider.pauseAutoScans)
            } else {
                add(actionProvider.resumeAutoScans)
            }
        }
        if (codeScanManager.isCodeScanInProgress()) {
            add(actionProvider.stopScan)
        } else {
            add(actionProvider.runScan)
        }
    }

fun<T> buildActionListForOtherFeatures(actionProvider: ActionProvider<T>): List<T> =
    buildList {
        add(actionProvider.openChatPanel)
    }

fun<T> buildActionListForConnectHelp(actionProvider: ActionProvider<T>): List<T> =
    buildList {
        add(actionProvider.sendFeedback)
        add(actionProvider.connectOnGithub)
        add(actionProvider.documentation)
    }
