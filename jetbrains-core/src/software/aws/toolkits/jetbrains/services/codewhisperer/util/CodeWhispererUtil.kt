// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import com.intellij.notification.NotificationAction
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.codewhispererruntime.model.Completion
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.loginSso
import software.aws.toolkits.jetbrains.core.credentials.maybeReauthProviderIfNeeded
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenAuthState
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProvider
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.CodeWhispererLoginLearnMoreAction
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.CodeWhispererSsoLearnMoreAction
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.ConnectWithAwsToContinueActionError
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.ConnectWithAwsToContinueActionWarn
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.DoNotShowAgainActionError
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.DoNotShowAgainActionWarn
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererExpired
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.jetbrains.utils.notifyWarn
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodewhispererCompletionType

object CodeWhispererUtil {

    fun checkCompletionType(
        results: List<Completion>,
        noRecommendation: Boolean
    ): CodewhispererCompletionType {
        if (noRecommendation) {
            return CodewhispererCompletionType.Unknown
        }
        return if (results[0].content().contains("\n")) {
            CodewhispererCompletionType.Block
        } else {
            CodewhispererCompletionType.Line
        }
    }

    // return true if every recommendation is empty
    fun checkEmptyRecommendations(recommendations: List<Completion>): Boolean =
        recommendations.all { it.content().isEmpty() }

    fun notifyWarnCodeWhispererUsageLimit(project: Project? = null) {
        notifyWarn(
            message("codewhisperer.notification.usage_limit.warn.title"),
            message("codewhisperer.notification.usage_limit.codesuggestion.warn.content"),
            project,
        )
    }

    fun notifyErrorCodeWhispererUsageLimit(project: Project? = null, isCodeScan: Boolean = false) {
        notifyError(
            "",
            if (!isCodeScan) {
                message("codewhisperer.notification.usage_limit.codesuggestion.warn.content")
            } else {
                message("codewhisperer.notification.usage_limit.codescan.warn.content")
            },
            project,
        )
    }

    // show when user login with Accountless
    fun notifyWarnAccountless() = notifyWarn(
        "",
        message("codewhisperer.notification.accountless.warn.message"),
        null,
        listOf(CodeWhispererSsoLearnMoreAction(), ConnectWithAwsToContinueActionWarn(), DoNotShowAgainActionWarn())
    )

    // show after user selects Don't Show Again in Accountless login message
    fun notifyInfoAccountless() = notifyInfo(
        "",
        message("codewhisperer.notification.accountless.info.dont.show.again.message"),
        null,
        listOf(CodeWhispererLoginLearnMoreAction())
    )

    // show when user login with Accountless and Accountless is not supported by CW
    fun notifyErrorAccountless() = notifyError(
        "",
        message("codewhisperer.notification.accountless.error.message"),
        null,
        listOf(CodeWhispererSsoLearnMoreAction(), ConnectWithAwsToContinueActionError(), DoNotShowAgainActionError())
    )

    fun isAccessTokenExpired(project: Project): Boolean {
        val tokenProvider = tokenProvider(project) ?: return false
        val state = tokenProvider.state()
        return state == BearerTokenAuthState.NEEDS_REFRESH
    }

    fun isRefreshTokenExpired(project: Project): Boolean {
        val tokenProvider = tokenProvider(project) ?: return false
        val state = tokenProvider.state()
        return state == BearerTokenAuthState.NOT_AUTHENTICATED
    }

    // This will be called only when there's a CW connection, but it has expired(either accessToken or refreshToken)
    // 1. If connection is expired, try to refresh
    // 2. If not able to refresh, requesting re-login by showing a notification
    // 3. The notification will be shown at most once per IDE session
    // Return true if need to re-auth, false otherwise
    fun promptReAuth(project: Project): Boolean {
        if (CodeWhispererService.hasReAuthPromptBeenShown()) return false
        if (!isCodeWhispererExpired(project)) return false
        val tokenProvider = tokenProvider(project) ?: return false
        return maybeReauthProviderIfNeeded(project, tokenProvider) {
            runInEdt {
                notifyConnectionExpiredRequestReauth(project)
                CodeWhispererService.markReAuthPromptShown()
            }
        }
    }

    private fun notifyConnectionExpiredRequestReauth(project: Project) {
        if (CodeWhispererExplorerActionManager.getInstance().getConnectionExpiredDoNotShowAgain()) {
            return
        }
        notifyError(
            message("toolkit.sso_expire.dialog.title"),
            message("toolkit.sso_expire.dialog_message"),
            project,
            listOf(
                NotificationAction.create(message("toolkit.sso_expire.dialog.yes_button")) { _, notification ->
                    reconnectCodeWhisperer(project)
                    notification.expire()
                },
                NotificationAction.create(message("toolkit.sso_expire.dialog.no_button")) { _, notification ->
                    CodeWhispererExplorerActionManager.getInstance().setConnectionExpiredDoNotShowAgain(true)
                    notification.expire()
                }
            )
        )
    }

    fun getConnectionStartUrl(connection: ToolkitConnection?): String? {
        connection ?: return null
        if (connection !is ManagedBearerSsoConnection) return null
        return connection.startUrl
    }

    private fun tokenProvider(project: Project) = (
        ToolkitConnectionManager
            .getInstance(project)
            .activeConnectionForFeature(CodeWhispererConnection.getInstance()) as? AwsBearerTokenConnection
        )
        ?.getConnectionSettings()
        ?.tokenProvider
        ?.delegate as? BearerTokenProvider

    fun reconnectCodeWhisperer(project: Project) {
        val connection = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance())
        if (connection !is ManagedBearerSsoConnection) return
        ApplicationManager.getApplication().executeOnPooledThread {
            loginSso(project, connection.startUrl, connection.region, connection.scopes)
        }
    }
}

enum class CaretMovement {
    NO_CHANGE, MOVE_FORWARD, MOVE_BACKWARD
}
