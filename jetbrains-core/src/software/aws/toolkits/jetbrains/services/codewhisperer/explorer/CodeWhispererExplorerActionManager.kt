// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.BaseState
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.util.messages.Topic
import com.intellij.util.xmlb.annotations.Property
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.DevToolsToolWindow
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanManager
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientManager
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.TokenDialog
import software.aws.toolkits.jetbrains.services.codewhisperer.toolwindow.CodeWhispererCodeReferenceManager
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.telemetry.AwsTelemetry
import java.net.URI

@State(name = "codewhispererStates", storages = [Storage("aws.xml")])
internal class CodeWhispererExplorerActionManager : PersistentStateComponent<CodeWhispererExploreActionState> {
    private val actionState = CodeWhispererExploreActionState()

    fun performAction(project: Project, actionId: String) {
        when (actionId) {
            ACTION_WHAT_IS_CODEWHISPERER -> {
                showWhatIsCodeWhisperer()
            }
            ACTION_ENABLE_CODEWHISPERER -> {
                enableCodeWhisperer(project)
            }
            ACTION_PAUSE_CODEWHISPERER -> {
                setAutoSuggestion(project, false)
            }
            ACTION_RESUME_CODEWHISPERER -> {
                setAutoSuggestion(project, true)
            }
            ACTION_OPEN_CODE_REFERENCE_PANEL -> {
                showCodeReferencePanel(project)
            }
            ACTION_REQUEST_ACCESSTOKEN -> {
                showTokenRegistrationPage()
            }
            ACTION_ENTER_ACCESSTOKEN -> {
                showTokenDialog(project)
            }
            ACTION_RUN_SECURITY_SCAN -> {
                runCodeScan(project)
            }
        }
    }

    fun showCodeReferencePanel(project: Project) {
        CodeWhispererCodeReferenceManager.getInstance(project).showCodeReferencePanel()
    }

    fun isAutoEnabled(): Boolean = actionState.value.getOrDefault(CodeWhispererExploreStateType.IsAutoEnabled, false)

    fun setAutoEnabled(isAutoEnabled: Boolean) {
        actionState.value[CodeWhispererExploreStateType.IsAutoEnabled] = isAutoEnabled
    }

    fun isManualEnabled(): Boolean = actionState.value.getOrDefault(CodeWhispererExploreStateType.IsManualEnabled, false)

    fun setManualEnabled(isManualEnabled: Boolean) {
        actionState.value[CodeWhispererExploreStateType.IsManualEnabled] = isManualEnabled
    }

    fun isEnabled(): Boolean = isAutoEnabled() && isManualEnabled()

    fun hasAcceptedTermsOfService(): Boolean = actionState.value.getOrDefault(CodeWhispererExploreStateType.HasAcceptedTermsOfServices, false)

    fun setHasAcceptedTermsOfService(hasAcceptedTermsOfService: Boolean) {
        actionState.value[CodeWhispererExploreStateType.HasAcceptedTermsOfServices] = hasAcceptedTermsOfService
        ApplicationManager.getApplication().messageBus.syncPublisher(CODEWHISPERER_ACTIVATION_CHANGED)
            .activationChanged(hasAcceptedTermsOfService)
    }

    fun isAuthorized(): Boolean = actionState.token != null

    @Synchronized
    fun setAuthorized(token: String?) {
        actionState.token = token
    }

    fun showWhatIsCodeWhisperer() {
        val uri = URI(CodeWhispererConstants.CODEWHISPERER_LEARN_MORE_URI)
        BrowserUtil.browse(uri)
    }

    fun showTokenRegistrationPage() {
        val uri = URI(CodeWhispererConstants.CODEWHISPERER_TOKEN_REQUEST_LINK)
        BrowserUtil.browse(uri)
    }

    fun enableCodeWhisperer(project: Project) {
        showCodeWhispererToS(project)
    }

    private fun showCodeWhispererToS(project: Project) {
        val dialog = CodeWhispererTermsOfServiceDialog(project)
        if (dialog.showAndGet()) {
            setManualEnabled(true)
            setAutoEnabled(true)
            setHasAcceptedTermsOfService(true)
            refreshCodeWhispererNode(project)
        }
    }

    private fun showTokenDialog(project: Project) {
        TokenDialog(project).showAndGet()
    }

    private fun setAutoSuggestion(project: Project, isAutoEnabled: Boolean) {
        setAutoEnabled(isAutoEnabled)
        val autoSuggestionState = if (isAutoEnabled) CodeWhispererConstants.AutoSuggestion.ACTIVATED else CodeWhispererConstants.AutoSuggestion.DEACTIVATED
        AwsTelemetry.modifySetting(project, settingId = CodeWhispererConstants.AutoSuggestion.SETTING_ID, settingState = autoSuggestionState)
        refreshCodeWhispererNode(project)
    }

    fun refreshCodeWhispererNode(project: Project) {
        runInEdt {
            val explorer = DevToolsToolWindow.getInstance(project)
            explorer.redrawTree()
        }
    }

    private fun runCodeScan(project: Project) {
        CodeWhispererCodeScanManager.getInstance(project).runCodeScan()
    }

    /**
     * Will be called from CodeWhispererService.showRecommendationInPopup()
     * Caller (e.x. CodeWhispererService) should take care if null value returned, popup a notification/hint window or dialog etc.
     */
    fun resolveAccessToken(): String? {
        if (actionState.token == null) { LOG.warn { "Logical Error: Try to get access token before token initialization" } }
        return actionState.token
    }

    /**
     * Will be called from token input dialog for CodeWhisperer first time users
     */
    fun getNewAccessTokenAndPersist(identityToken: String) {
        val codewhispererClient = CodeWhispererClientManager.getInstance().getClient()
        val response = codewhispererClient.getAccessToken { it.identityToken(identityToken) }

        setAuthorized(response.accessToken())
    }

    override fun getState(): CodeWhispererExploreActionState = CodeWhispererExploreActionState().apply {
        value.putAll(actionState.value)
        token = actionState.token
    }

    override fun loadState(state: CodeWhispererExploreActionState) {
        actionState.value.clear()
        actionState.token = state.token
        if (actionState.token == null) {
            CodeWhispererExploreStateType.values().forEach {
                actionState.value[it] = false
            }
            return
        }
        actionState.value.putAll(state.value)
    }

    fun reset() {
        setManualEnabled(false)
        setAutoEnabled(false)
        setHasAcceptedTermsOfService(false)
    }

    companion object {
        @JvmStatic
        fun getInstance(): CodeWhispererExplorerActionManager = service()
        const val ACTION_ENABLE_CODEWHISPERER = "enableCodeWhisperer"
        const val ACTION_WHAT_IS_CODEWHISPERER = "whatIsCodeWhisperer"
        const val ACTION_PAUSE_CODEWHISPERER = "pauseCodeWhisperer"
        const val ACTION_RESUME_CODEWHISPERER = "resumeCodeWhisperer"
        const val ACTION_OPEN_CODE_REFERENCE_PANEL = "openCodeReferencePanel"
        const val ACTION_REQUEST_ACCESSTOKEN = "requestAccessToken"
        const val ACTION_ENTER_ACCESSTOKEN = "enterAccessToken"
        const val ACTION_RUN_SECURITY_SCAN = "runSecurityScan"
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

    @get:Property
    var token by string()
}

internal enum class CodeWhispererExploreStateType {
    IsAutoEnabled,
    IsManualEnabled,
    HasAcceptedTermsOfServices,
}

interface CodeWhispererActivationChangedListener {
    fun activationChanged(value: Boolean) {}
}
