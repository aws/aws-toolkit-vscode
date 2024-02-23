// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.learn

import com.intellij.icons.AllIcons
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.impl.EditorImpl
import com.intellij.openapi.editor.impl.FoldingModelImpl
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.fileEditor.impl.NonProjectFileWritingAccessProvider
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.ui.JBColor
import com.intellij.ui.components.ActionLink
import com.intellij.ui.components.BrowserLink
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.addHorizontalGlue
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.inlineLabelConstraints
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.kebabMenuConstraints
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.tryExampleButtonConstraints
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.tryExampleLabelConstraints
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.tryExampleRowConstraints
import software.aws.toolkits.jetbrains.services.codewhisperer.learn.LearnCodeWhispererManager.Companion.taskTypeToFilename
import software.aws.toolkits.jetbrains.services.codewhisperer.model.TryExampleRowContext
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererTelemetryService
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererColorUtil.POPUP_BUTTON_BORDER
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererColorUtil.TRY_EXAMPLE_EVEN_ROW_COLOR
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.CODEWHISPERER_SUPPORTED_LANG_URI
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.TryExampleFileContent.tryExampleFileContexts
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodewhispererGettingStartedTask
import software.aws.toolkits.telemetry.UiTelemetry
import java.awt.GridBagLayout
import java.io.File
import javax.swing.BorderFactory
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.JPanel

object LearnCodeWhispererUIComponents {
    // "Banner" section components
    fun bannerPanel() = JPanel(GridBagLayout()).apply {
        background = JBColor.BLUE.darker().darker()
        add(JLabel(AllIcons.General.Information), inlineLabelConstraints)
        add(JLabel(" "), inlineLabelConstraints)
        add(JLabel(message("codewhisperer.learn_page.banner.message.new_user")), inlineLabelConstraints)
        addHorizontalGlue()
        add(
            ActionLink(message("codewhisperer.learn_page.banner.dismiss")) {
                this@apply.isVisible = false
                this@apply.repaint()
            },
            kebabMenuConstraints
        )
    }

    // "Try Example" section components
    private val tryExampleRowContexts = mapOf(
        CodewhispererGettingStartedTask.AutoTrigger to
            TryExampleRowContext(
                message("codewhisperer.learn_page.examples.tasks.description_1"),
                taskTypeToFilename[CodewhispererGettingStartedTask.AutoTrigger]
            ),
        CodewhispererGettingStartedTask.ManualTrigger to
            TryExampleRowContext(
                if (SystemInfo.isMac) {
                    message("codewhisperer.learn_page.examples.tasks.description_2.mac")
                } else {
                    message("codewhisperer.learn_page.examples.tasks.description_2.win")
                },
                taskTypeToFilename[CodewhispererGettingStartedTask.ManualTrigger]
            ),
        CodewhispererGettingStartedTask.UnitTest to
            TryExampleRowContext(
                message("codewhisperer.learn_page.examples.tasks.description_3"),
                taskTypeToFilename[CodewhispererGettingStartedTask.UnitTest]
            )
    )

    private fun tryExampleRow(project: Project, taskType: CodewhispererGettingStartedTask, isEvenRow: Boolean = false): JPanel {
        val tryExampleRowContext = tryExampleRowContexts[taskType] ?: return JPanel()

        return JPanel(GridBagLayout()).apply {
            add(JLabel(tryExampleRowContext.description), tryExampleLabelConstraints)
            addHorizontalGlue()
            val button = JButton(message("codewhisperer.learn_page.examples.tasks.button")).apply {
                isOpaque = !isEvenRow

                addActionListener {
                    val currentLanguage = LearnCodeWhispererManager.getInstance(project).language
                    val fileContext = tryExampleFileContexts[taskType]?.get(currentLanguage) ?: return@addActionListener
                    val fileContent = fileContext.first
                    val caretOffset = fileContext.second
                    CodeWhispererTelemetryService.getInstance().sendOnboardingClickEvent(currentLanguage, taskType)
                    val fileExtension = LearnCodeWhispererManager.getInstance(project).fileExtension
                    val fullFilename = "${tryExampleRowContext.filename}$fileExtension"
                    val (editor, fileExists) = createOrOpenFileInEditor(project, fullFilename, fileContent)
                    if (editor == null) return@addActionListener
                    (editor.foldingModel as FoldingModelImpl).isFoldingEnabled = false
                    (editor.foldingModel as FoldingModelImpl).rebuild()
                    (editor as EditorImpl).resetSizes()
                    editor.caretModel.updateVisualPosition()
                    if (fileExists) return@addActionListener
                    editor.caretModel.moveToOffset(caretOffset)
                }
            }

            add(button, tryExampleButtonConstraints)
            if (isEvenRow) {
                background = TRY_EXAMPLE_EVEN_ROW_COLOR
            }
        }
    }

    val examplesDescriptionPanel = JPanel(GridBagLayout()).apply {
        add(JLabel(message("codewhisperer.learn_page.examples.description.part_1")), inlineLabelConstraints)
        add(
            BrowserLink(
                message("codewhisperer.learn_page.examples.description.part_2"),
                CODEWHISPERER_SUPPORTED_LANG_URI
            ).apply {
                addActionListener {
                    UiTelemetry.click(null as Project?, "codewhisperer_GenerateSuggestions_LearnMore")
                }
            },
            inlineLabelConstraints
        )
        add(JLabel(message("codewhisperer.learn_page.examples.description.part_3")), inlineLabelConstraints)
        addHorizontalGlue()
    }

    private fun createOrOpenFileInEditor(project: Project, fileName: String, content: String): Pair<Editor?, Boolean> {
        // Get the idea.system.path
        val systemPath = PathManager.getSystemPath()

        // Create the "codewhisperer" directory if it doesn't exist
        val directory = File("$systemPath/codewhisperer")
        if (!directory.exists()) {
            directory.mkdirs()
        }

        val file = File(directory, fileName)
        val fileExists = file.exists()
        if (!fileExists) {
            file.writeText(content)
        }

        // Refresh the file system to recognize the new file
        val virtualFile = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file) ?: return null to false
        if (!NonProjectFileWritingAccessProvider.isWriteAccessAllowed(virtualFile, project)) {
            NonProjectFileWritingAccessProvider.allowWriting(listOf(virtualFile))
        }

        return FileEditorManager.getInstance(project).openTextEditor(
            OpenFileDescriptor(project, virtualFile),
            true
        ) to fileExists
    }

    fun tryExamplePanel(project: Project) = JPanel(GridBagLayout()).apply {
        val firstTryExampleRow = tryExampleRow(project, CodewhispererGettingStartedTask.AutoTrigger)
        val secondTryExampleRow = tryExampleRow(project, CodewhispererGettingStartedTask.ManualTrigger, true)
        val thirdTryExampleRow = tryExampleRow(project, CodewhispererGettingStartedTask.UnitTest)
        add(firstTryExampleRow, tryExampleRowConstraints)
        add(secondTryExampleRow, tryExampleRowConstraints)
        add(thirdTryExampleRow, tryExampleRowConstraints)
        border = BorderFactory.createLineBorder(POPUP_BUTTON_BORDER)
    }
}
