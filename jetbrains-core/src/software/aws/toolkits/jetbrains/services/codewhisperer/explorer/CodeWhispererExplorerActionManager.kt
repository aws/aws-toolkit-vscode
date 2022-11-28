// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer

import com.intellij.ide.BrowserUtil
import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.BaseState
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.fileEditor.TextEditorWithPreview
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.util.messages.Topic
import com.intellij.util.xmlb.annotations.Property
import org.jetbrains.annotations.ApiStatus.ScheduledForRemoval
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.credentials.sono.isSono
import software.aws.toolkits.jetbrains.core.explorer.refreshDevToolTree
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanManager
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginDialog
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginType
import software.aws.toolkits.jetbrains.services.codewhisperer.startup.CodeWhispererProjectStartupActivity
import software.aws.toolkits.jetbrains.services.codewhisperer.toolwindow.CodeWhispererCodeReferenceManager
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.getConnectionStartUrl
import software.aws.toolkits.telemetry.AwsTelemetry
import software.aws.toolkits.telemetry.UiTelemetry
import java.net.URI

// TODO: refactor this class, now it's managing action and state
@State(name = "codewhispererStates", storages = [Storage("aws.xml")])
internal class CodeWhispererExplorerActionManager : PersistentStateComponent<CodeWhispererExploreActionState> {
    private val actionState = CodeWhispererExploreActionState()
    private val suspendedConnections = mutableSetOf<String>()

    fun performAction(project: Project, actionId: String) {
        when (actionId) {
            ACTION_WHAT_IS_CODEWHISPERER -> {
                showWhatIsCodeWhisperer()
                UiTelemetry.click(project, "cw_learnMore_Cta")
            }

            ACTION_ENABLE_CODEWHISPERER -> {
                enableCodeWhisperer(project)
                UiTelemetry.click(project, "cw_signUp_Cta")
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

            ACTION_RUN_SECURITY_SCAN -> {
                runCodeScan(project)
            }
        }
    }

    /**
     * 2 cases
     * (1) User who don't have SSO based connection click on CodeWhisperer Start node
     * (2) User who already have SSO based connection from previous operation via i.g. Toolkit Add Connection click on CodeWhisperer Start node
     */
    fun enableCodeWhisperer(project: Project) {
        val connectionManager = ToolkitConnectionManager.getInstance(project)
        connectionManager.activeConnectionForFeature(CodeWhispererConnection.getInstance())?.let {
            // Already have connection, show ToS if needed and that's it
            showCodeWhispererToSIfNeeded(project)
            project.refreshDevToolTree()
        } ?: run {
            runInEdt {
                // Start from scratch if no active connection
                if (CodeWhispererLoginDialog(project).showAndGet()) {
                    showCodeWhispererToSIfNeeded(project)
                    project.refreshDevToolTree()
                }
            }
        }

        if (isCodeWhispererEnabled(project)) {
            StartupActivity.POST_STARTUP_ACTIVITY.extensionList.forEach {
                if (it is CodeWhispererProjectStartupActivity) {
                    it.runActivity(project)
                }
            }
            if (!hasShownHowToUseCodeWhisperer()) {
                showHowToUseCodeWhispererPage(project)
            }
        }
    }

    fun showCodeReferencePanel(project: Project) {
        CodeWhispererCodeReferenceManager.getInstance(project).showCodeReferencePanel()
    }

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

    fun showWhatIsCodeWhisperer() {
        val uri = URI(CodeWhispererConstants.CODEWHISPERER_LEARN_MORE_URI)
        BrowserUtil.browse(uri)
    }

    fun showCodeWhispererToSIfNeeded(project: Project) {
        if (hasAcceptedTermsOfService()) return
        if (CodeWhispererTermsOfServiceDialog(null).showAndGet()) {
            setHasAcceptedTermsOfService(true)
            UiTelemetry.click(project, "cwToS_accept")
        } else {
            UiTelemetry.click(project, "cwToS_cancel")
        }
    }

    private fun showHowToUseCodeWhispererPage(project: Project) {
        val plugin = PluginManagerCore.getPlugin(PluginId.getId(AwsToolkit.PLUGIN_ID)) ?: return
        val path = plugin.pluginPath.resolve("assets").resolve("WelcomeToCodeWhisperer.md") ?: return
        VfsUtil.findFile(path, true)?.let { readme ->
            readme.putUserData(TextEditorWithPreview.DEFAULT_LAYOUT_FOR_FILE, TextEditorWithPreview.Layout.SHOW_PREVIEW)

            val fileEditorManager = FileEditorManager.getInstance(project)
            ApplicationManager.getApplication().invokeLater {
                val editor = fileEditorManager.openTextEditor(OpenFileDescriptor(project, readme), true)
                if (editor == null) {
                    LOG.warn { "Failed to open WelcomeToCodeWhisperer.md" }
                } else {
                    setHasShownHowToUseCodeWhisperer(true)
                }
            }
        }
    }

    private fun setAutoSuggestion(project: Project, isAutoEnabled: Boolean) {
        setAutoEnabled(isAutoEnabled)
        val autoSuggestionState = if (isAutoEnabled) CodeWhispererConstants.AutoSuggestion.ACTIVATED else CodeWhispererConstants.AutoSuggestion.DEACTIVATED
        AwsTelemetry.modifySetting(project, settingId = CodeWhispererConstants.AutoSuggestion.SETTING_ID, settingState = autoSuggestionState)
        project.refreshDevToolTree()
    }

    private fun runCodeScan(project: Project) {
        CodeWhispererCodeScanManager.getInstance(project).runCodeScan()
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
    }

    override fun loadState(state: CodeWhispererExploreActionState) {
        actionState.value.clear()
        actionState.token = state.token
        actionState.value.putAll(state.value)
    }

    companion object {
        @JvmStatic
        fun getInstance(): CodeWhispererExplorerActionManager = service()
        const val ACTION_ENABLE_CODEWHISPERER = "enableCodeWhisperer"
        const val ACTION_WHAT_IS_CODEWHISPERER = "whatIsCodeWhisperer"
        const val ACTION_PAUSE_CODEWHISPERER = "pauseCodeWhisperer"
        const val ACTION_RESUME_CODEWHISPERER = "resumeCodeWhisperer"
        const val ACTION_OPEN_CODE_REFERENCE_PANEL = "openCodeReferencePanel"
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

    // can not remove this as we want to support existing accountless users
    @get:Property
    var token by string()
}

// TODO: Don't remove IsManualEnabled
internal enum class CodeWhispererExploreStateType {
    IsAutoEnabled,
    IsManualEnabled,
    HasAcceptedTermsOfServices,
    HasShownHowToUseCodeWhisperer
}

interface CodeWhispererActivationChangedListener {
    fun activationChanged(value: Boolean) {}
}

fun isCodeWhispererEnabled(project: Project) = with(CodeWhispererExplorerActionManager.getInstance()) {
    checkActiveCodeWhispererConnectionType(project) != CodeWhispererLoginType.Logout
}
