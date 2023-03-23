// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import com.intellij.ide.BrowserUtil
import com.intellij.notification.NotificationAction
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.codewhisperer.model.Recommendation
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.BearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.loginSso
import software.aws.toolkits.jetbrains.core.credentials.logoutFromSsoConnection
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
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.jetbrains.utils.notifyWarn
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodewhispererCompletionType
import java.net.URI

object CodeWhispererUtil {

    fun checkCompletionType(
        results: List<Recommendation>,
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
    fun checkEmptyRecommendations(recommendations: List<Recommendation>): Boolean =
        recommendations.all { it.content().isEmpty() }

    fun notifyWarnCodeWhispererUsageLimit(project: Project? = null) {
        notifyWarn(
            message("codewhisperer.notification.usage_limit.warn.title"),
            message("codewhisperer.notification.usage_limit.warn.content"),
            project,
        )
    }

    fun notifyErrorCodeWhispererUsageLimit(project: Project? = null) {
        notifyError(
            "",
            message("codewhisperer.notification.usage_limit.warn.content"),
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

    fun isConnectionExpired(project: Project): Boolean {
        val tokenProvider = tokenProvider(project) ?: return false
        val state = tokenProvider.state()
        return state == BearerTokenAuthState.NEEDS_REFRESH || state == BearerTokenAuthState.NOT_AUTHENTICATED
    }

    fun promptReAuth(project: Project, callback: () -> Unit = {}) {
        val connection = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance())
        if (connection !is BearerSsoConnection) return
        val tokenProvider = tokenProvider(project) ?: return
        maybeReauthProviderIfNeeded(project, tokenProvider) {
            runInEdt {
                notifyConnectionExpired(project, connection)
                callback()
            }
        }
    }

    private fun notifyConnectionExpired(project: Project, connection: BearerSsoConnection?) {
        connection ?: return
        logoutFromSsoConnection(project, connection)
        notifyError(
            message("toolkit.sso_expire.dialog.title", connection.label),
            message("toolkit.sso_expire.dialog_message"),
            project,
            listOf(
                NotificationAction.create(message("toolkit.sso_expire.dialog.yes_button")) { _, notification ->
                    ApplicationManager.getApplication().executeOnPooledThread {
                        getConnectionStartUrl(connection)?.let { startUrl ->
                            loginSso(project, startUrl, connection.scopes)
                        }
                    }
                    notification.expire()
                },
                NotificationAction.createSimple(message("aws.settings.learn_more")) {
                    BrowserUtil.browse(URI("https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/codewhisperer.html"))
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
}

enum class CaretMovement {
    NO_CHANGE, MOVE_FORWARD, MOVE_BACKWARD
}
