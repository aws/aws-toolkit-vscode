// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.BaseState
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.util.messages.Topic
import com.intellij.util.xmlb.annotations.Property
import org.jetbrains.annotations.ApiStatus.ScheduledForRemoval
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.credentials.sono.isSono
import software.aws.toolkits.jetbrains.core.explorer.refreshDevToolTree
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginType
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.getConnectionStartUrl
import software.aws.toolkits.telemetry.AwsTelemetry
import java.time.LocalDateTime

// TODO: refactor this class, now it's managing action and state
@State(name = "codewhispererStates", storages = [Storage("aws.xml")])
internal class CodeWhispererExplorerActionManager : PersistentStateComponent<CodeWhispererExploreActionState> {
    private val actionState = CodeWhispererExploreActionState()
    private val suspendedConnections = mutableSetOf<String>()

    fun isSuspended(project: Project): Boolean {
        val startUrl = getCodeWhispererConnectionStartUrl(project)
        return suspendedConnections.contains(startUrl)
    }

    fun setSuspended(project: Project) {
        val startUrl = getCodeWhispererConnectionStartUrl(project)
        if (!suspendedConnections.add(startUrl)) {
            return
        }
        project.refreshDevToolTree()
    }

    private fun getCodeWhispererConnectionStartUrl(project: Project): String {
        val connection = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance())
        return getConnectionStartUrl(connection) ?: CodeWhispererConstants.ACCOUNTLESS_START_URL
    }

    fun isAutoEnabled(): Boolean = actionState.value.getOrDefault(CodeWhispererExploreStateType.IsAutoEnabled, true)

    fun setAutoEnabled(isAutoEnabled: Boolean) {
        actionState.value[CodeWhispererExploreStateType.IsAutoEnabled] = isAutoEnabled
    }

    fun hasAcceptedTermsOfService(): Boolean = actionState.value.getOrDefault(CodeWhispererExploreStateType.HasAcceptedTermsOfServices, false)

    fun setHasAcceptedTermsOfService(hasAcceptedTermsOfService: Boolean) {
        actionState.value[CodeWhispererExploreStateType.HasAcceptedTermsOfServices] = hasAcceptedTermsOfService
        ApplicationManager.getApplication().messageBus.syncPublisher(CODEWHISPERER_ACTIVATION_CHANGED)
            .activationChanged(hasAcceptedTermsOfService)
    }

    fun hasShownHowToUseCodeWhisperer(): Boolean = actionState.value.getOrDefault(CodeWhispererExploreStateType.HasShownHowToUseCodeWhisperer, false)

    fun setHasShownHowToUseCodeWhisperer(hasShownHowToUseCodeWhisperer: Boolean) {
        actionState.value[CodeWhispererExploreStateType.HasShownHowToUseCodeWhisperer] = hasShownHowToUseCodeWhisperer
    }

    fun setAccountlessNotificationTimestamp() {
        actionState.accountlessWarnTimestamp = LocalDateTime.now().format(CodeWhispererConstants.TIMESTAMP_FORMATTER)
    }

    fun getAccountlessNotificationTimestamp(): String? = actionState.accountlessWarnTimestamp

    fun getDoNotShowAgain(): Boolean = actionState.value.getOrDefault(CodeWhispererExploreStateType.DoNotShowAgain, false)

    fun setDoNotShowAgain(doNotShowAgain: Boolean) {
        actionState.value[CodeWhispererExploreStateType.DoNotShowAgain] = doNotShowAgain
    }

    fun setAutoSuggestion(project: Project, isAutoEnabled: Boolean) {
        setAutoEnabled(isAutoEnabled)
        val autoSuggestionState = if (isAutoEnabled) CodeWhispererConstants.AutoSuggestion.ACTIVATED else CodeWhispererConstants.AutoSuggestion.DEACTIVATED
        AwsTelemetry.modifySetting(project, settingId = CodeWhispererConstants.AutoSuggestion.SETTING_ID, settingState = autoSuggestionState)
        project.refreshDevToolTree()
    }

    @Deprecated("Accountless credential will be removed soon")
    @ScheduledForRemoval
    // Will keep it for existing accountless users
    /**
     * Will be called from CodeWhispererService.showRecommendationInPopup()
     * Caller (e.x. CodeWhispererService) should take care if null value returned, popup a notification/hint window or dialog etc.
     */
    fun resolveAccessToken(): String? {
        if (actionState.token == null) {
            LOG.warn { "Logical Error: Try to get access token before token initialization" }
        }
        return actionState.token
    }

    fun checkActiveCodeWhispererConnectionType(project: Project) = when {
        !hasAcceptedTermsOfService() -> CodeWhispererLoginType.Logout
        actionState.token != null -> CodeWhispererLoginType.Accountless
        else -> {
            val conn = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance())
            if (conn != null) {
                if (conn.isSono()) {
                    CodeWhispererLoginType.Sono
                } else {
                    CodeWhispererLoginType.SSO
                }
            } else {
                CodeWhispererLoginType.Logout
            }
        }
    }

    fun nullifyAccountlessCredentialIfNeeded() {
        if (actionState.token != null) {
            actionState.token = null
        }
    }

    override fun getState(): CodeWhispererExploreActionState = CodeWhispererExploreActionState().apply {
        value.putAll(actionState.value)
        token = actionState.token
        accountlessWarnTimestamp = actionState.accountlessWarnTimestamp
    }

    override fun loadState(state: CodeWhispererExploreActionState) {
        actionState.value.clear()
        actionState.token = state.token
        actionState.value.putAll(state.value)
        actionState.accountlessWarnTimestamp = state.accountlessWarnTimestamp
    }

    companion object {
        @JvmStatic
        fun getInstance(): CodeWhispererExplorerActionManager = service()

        val CODEWHISPERER_ACTIVATION_CHANGED: Topic<CodeWhispererActivationChangedListener> = Topic.create(
            "CodeWhisperer enabled",
            CodeWhispererActivationChangedListener::class.java
        )
        private val LOG = getLogger<CodeWhispererExplorerActionManager>()
    }
}

internal class CodeWhispererExploreActionState : BaseState() {
    @get:Property
    val value by map<CodeWhispererExploreStateType, Boolean>()

    // can not remove this as we want to support existing accountless users
    @get:Property
    var token by string()

    @get:Property
    var accountlessWarnTimestamp by string()
}

// TODO: Don't remove IsManualEnabled
internal enum class CodeWhispererExploreStateType {
    IsAutoEnabled,
    IsManualEnabled,
    HasAcceptedTermsOfServices,
    HasShownHowToUseCodeWhisperer,
    DoNotShowAgain,
}

interface CodeWhispererActivationChangedListener {
    fun activationChanged(value: Boolean) {}
}

fun isCodeWhispererEnabled(project: Project) = with(CodeWhispererExplorerActionManager.getInstance()) {
    checkActiveCodeWhispererConnectionType(project) != CodeWhispererLoginType.Logout
}
