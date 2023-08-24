// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.gettingstarted.editor

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.util.ui.components.BorderLayoutPanel
import javax.swing.JLabel

class GettingStartedPanel : BorderLayoutPanel() {
    init {
        addToCenter(JLabel("Hello world"))
    }

    companion object {
        fun openPanel(project: Project) = FileEditorManager.getInstance(project).openTextEditor(
            OpenFileDescriptor(
                project,
                GettingStartedVirtualFile()
            ),
            true
        )
    }
}
