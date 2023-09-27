// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes

import com.intellij.icons.AllIcons
import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.fileEditor.TextEditorWithPreview
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import com.intellij.openapi.vfs.VfsUtil
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.explorer.refreshDevToolTree
import software.aws.toolkits.jetbrains.core.gettingstarted.requestCredentialsForCodeWhisperer
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererEnabled
import software.aws.toolkits.jetbrains.services.codewhisperer.startup.CodeWhispererProjectStartupActivity
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.UiTelemetry
import java.awt.event.MouseEvent

class GetStartedNode(nodeProject: Project) : CodeWhispererActionNode(
    nodeProject,
    message("codewhisperer.explorer.enable"),
    0,
    AllIcons.Actions.Execute
) {
    override fun onDoubleClick(event: MouseEvent) {
        enableCodeWhisperer(project)
        UiTelemetry.click(project, "cw_signUp_Cta")
        UiTelemetry.click(project, "auth_start_CodeWhisperer")
    }

    /**
     * 2 cases
     * (1) User who don't have SSO based connection click on CodeWhisperer Start node
     * (2) User who already have SSO based connection from previous operation via i.g. Toolkit Add Connection click on CodeWhisperer Start node
     */
    private fun enableCodeWhisperer(project: Project) {
        val explorerActionManager = CodeWhispererExplorerActionManager.getInstance()
        val connectionManager = ToolkitConnectionManager.getInstance(project)
        connectionManager.activeConnectionForFeature(CodeWhispererConnection.getInstance())?.let {
            project.refreshDevToolTree()
        } ?: run {
            runInEdt {
                // Start from scratch if no active connection
                if (requestCredentialsForCodeWhisperer(project)) {
                    project.refreshDevToolTree()
                }
            }
        }

        if (isCodeWhispererEnabled(project)) {
            StartupActivity.POST_STARTUP_ACTIVITY.findExtension(CodeWhispererProjectStartupActivity::class.java)?.let {
                it.runActivity(project)
            }
            if (!explorerActionManager.hasShownHowToUseCodeWhisperer()) {
                showHowToUseCodeWhispererPage(project)
            }
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
                    CodeWhispererExplorerActionManager.getInstance().setHasShownHowToUseCodeWhisperer(true)
                }
            }
        }
    }

    companion object {
        private val LOG = getLogger<GetStartedNode>()
    }
}
