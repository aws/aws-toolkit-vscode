// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.startup

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.fileEditor.TextEditorWithPreview
import com.intellij.openapi.fileEditor.TextEditorWithPreview.DEFAULT_LAYOUT_FOR_FILE
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.util.ResourceUtil
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import java.net.URL

class CodeWhispererBetaLandingPage : StartupActivity.DumbAware {
    override fun runActivity(project: Project) {
        if (ApplicationManager.getApplication().isUnitTestMode) return
        if (!CodeWhispererExplorerActionManager.getInstance().hasAcceptedTermsOfService()) return
        val url: URL = ResourceUtil.getResource(javaClass, "codewhisperer", "WelcomeToCodeWhisperer.md")
        VfsUtil.findFileByURL(url)?.let { readme ->
            readme.putUserData(DEFAULT_LAYOUT_FOR_FILE, TextEditorWithPreview.Layout.SHOW_PREVIEW)

            val fileEditorManager = FileEditorManager.getInstance(project)
            runInEdt {
                val editor = fileEditorManager.openTextEditor(OpenFileDescriptor(project, readme), true)
                if (editor == null) {
                    LOG.warn { "Failed to open WelcomeToCodeWhisperer.md" }
                }
            }
        }
    }

    companion object {
        private val LOG = getLogger<CodeWhispererService>()
    }
}
