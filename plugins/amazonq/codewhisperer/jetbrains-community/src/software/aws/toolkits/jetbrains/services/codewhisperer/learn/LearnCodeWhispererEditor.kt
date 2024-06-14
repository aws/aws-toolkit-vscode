// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.learn

import com.intellij.codeHighlighting.BackgroundEditorHighlighter
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorLocation
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.fileEditor.FileEditorStateLevel
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.dsl.builder.Align
import com.intellij.ui.dsl.builder.AlignY
import com.intellij.ui.dsl.builder.BottomGap
import com.intellij.ui.dsl.builder.Panel
import com.intellij.ui.dsl.builder.TopGap
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.gridLayout.Gaps
import icons.AwsIcons
import software.aws.toolkits.jetbrains.services.codewhisperer.learn.LearnCodeWhispererUIComponents.examplesDescriptionPanel
import software.aws.toolkits.jetbrains.services.codewhisperer.learn.LearnCodeWhispererUIComponents.tryExamplePanel
import software.aws.toolkits.resources.message
import java.beans.PropertyChangeListener
import javax.swing.JComponent

class LearnCodeWhispererEditor(val project: Project, val virtualFile: VirtualFile) : UserDataHolderBase(), FileEditor {
    private val contentPanel = panel {
        row {
            panel {
                customize(Gaps(20, 50, 0, 0))
                row {
                    icon(AwsIcons.Logos.AWS_Q_GRADIENT)

                    panel {
                        title(message("codewhisperer.learn_page.header.title"))
                        row {
                            label(message("codewhisperer.learn_page.header.description"))
                        }
                    }
                }
            }
        }.topGap(TopGap.MEDIUM).bottomGap(BottomGap.MEDIUM)

        row {
            // Single panel
            panel {
                customize(Gaps(0, 50, 0, 0))
                align(AlignY.TOP)

                subtitle(message("codewhisperer.learn_page.examples.title")).bottomGap(BottomGap.MEDIUM)
                row {
                    cell(tryExamplePanel(project)).widthGroup(FIRST_COLUMN_WIDTH_GROUP)
                }.bottomGap(BottomGap.MEDIUM)
                row {
                    cell(examplesDescriptionPanel).widthGroup(FIRST_COLUMN_WIDTH_GROUP)
                }.bottomGap(BottomGap.MEDIUM)
            }
        }
    }
    private val rootPanel = panel {
        row {
            scrollCell(contentPanel).align(Align.FILL)
        }.resizableRow()
    }

    override fun getComponent(): JComponent = rootPanel

    override fun getName(): String = "LearnCodeWhisperer"

    override fun getPreferredFocusedComponent(): JComponent? = null

    override fun isValid(): Boolean = true

    override fun getCurrentLocation(): FileEditorLocation? = null

    override fun getState(level: FileEditorStateLevel): FileEditorState = FileEditorState.INSTANCE

    override fun isModified(): Boolean = false

    override fun dispose() {}

    override fun addPropertyChangeListener(listener: PropertyChangeListener) {}

    override fun deselectNotify() {}

    override fun getBackgroundHighlighter(): BackgroundEditorHighlighter? = null

    override fun selectNotify() {}

    override fun removePropertyChangeListener(listener: PropertyChangeListener) {}

    override fun setState(state: FileEditorState) {}

    override fun getFile(): VirtualFile = virtualFile

    private fun Panel.title(text: String) = row {
        label(text).bold().applyToComponent { font = font.deriveFont(24f) }
    }

    private fun Panel.subtitle(text: String) = row {
        label(text).bold().applyToComponent { font = font.deriveFont(18f) }
    }

    companion object {
        private const val FIRST_COLUMN_WIDTH_GROUP = "firstColumn"
    }
}
