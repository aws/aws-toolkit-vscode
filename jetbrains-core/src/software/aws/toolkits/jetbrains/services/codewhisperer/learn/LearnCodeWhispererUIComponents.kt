// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.learn

import com.intellij.icons.AllIcons
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.impl.EditorImpl
import com.intellij.openapi.editor.impl.FoldingModelImpl
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.fileEditor.impl.NonProjectFileWritingAccessProvider
import com.intellij.openapi.keymap.KeyMapBundle
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.ui.JBColor
import com.intellij.ui.components.ActionLink
import com.intellij.ui.components.BrowserLink
import com.intellij.util.ui.JBUI
import icons.AwsIcons
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.addHorizontalGlue
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.commandDescriptionConstraints
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.commandKeyShortcutConstraints
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.commandRowConstraints
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.componentPanelConstraints
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.horizontalPanelConstraints
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
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.CODEWHISPERER_CODE_SCAN_LEARN_MORE_URI
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.CODEWHISPERER_ONBOARDING_DOCUMENTATION_URI
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.CODEWHISPERER_SUPPORTED_LANG_URI
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.CODEWHISPERER_WORKSHOP_URI
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.TryExampleFileContent.tryExampleFileContexts
import software.aws.toolkits.jetbrains.ui.feedback.FeedbackDialog
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodewhispererGettingStartedTask
import software.aws.toolkits.telemetry.UiTelemetry
import java.awt.Color
import java.awt.Component
import java.awt.Font
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.GridBagLayout
import java.awt.RenderingHints
import java.io.File
import java.net.URI
import javax.swing.BorderFactory
import javax.swing.ImageIcon
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.border.AbstractBorder

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

    // "Commands" section components
    private val firstCommandRow = commandRow(
        message("codewhisperer.learn_page.commands.action.accept.name"),
        message("codewhisperer.learn_page.commands.action.accept.key_shortcut")
    )
    private val secondCommandRow = commandRow(
        message("codewhisperer.learn_page.commands.action.invoke.name"),
        if (SystemInfo.isMac) {
            message("codewhisperer.learn_page.commands.action.invoke.key_shortcut.mac")
        } else {
            message("codewhisperer.learn_page.commands.action.invoke.key_shortcut.win")
        },
        true
    )
    private val thirdCommandRow = commandRow(
        message("codewhisperer.learn_page.commands.action.navigate.name"),
        message("codewhisperer.learn_page.commands.action.navigate.key_shortcut"),
    )
    private val fourthCommandRow = commandRow(
        message("codewhisperer.learn_page.commands.action.reject.name"),
        message("codewhisperer.learn_page.commands.action.reject.key_shortcut"),
        true
    )

    private fun commandRow(action: String, keyShortcut: String, isEvenRow: Boolean = false) = JPanel(GridBagLayout()).apply {
        add(JLabel(action), commandDescriptionConstraints)
        addHorizontalGlue()
        add(JLabel(keyShortcut), commandKeyShortcutConstraints)

        if (!isEvenRow) {
            background = TRY_EXAMPLE_EVEN_ROW_COLOR
        }
    }

    private fun keyShortcutsPanel() = JPanel(GridBagLayout()).apply {
        add(firstCommandRow, commandRowConstraints)
        add(secondCommandRow, commandRowConstraints)
        add(thirdCommandRow, commandRowConstraints)
        add(fourthCommandRow, commandRowConstraints)
    }

    private fun keyShortcutsLinkPanel(project: Project) = JPanel(GridBagLayout()).apply {
        add(
            JPanel(GridBagLayout()).apply {
                add(JLabel(message("codewhisperer.learn_page.commands.description.part_1")), inlineLabelConstraints)
                add(
                    ActionLink(message("codewhisperer.learn_page.commands.description.part_2")) {
                        UiTelemetry.click(project, "codewhisperer_Commands_KeyboardShortcutsEditor")
                        ShowSettingsUtil.getInstance().showSettingsDialog(project, KeyMapBundle.message("keymap.display.name"))
                    },
                    inlineLabelConstraints
                )
                addHorizontalGlue()
            },
            horizontalPanelConstraints
        )
        add(
            JPanel(GridBagLayout()).apply {
                add(JLabel(message("codewhisperer.learn_page.commands.description.part_3")), inlineLabelConstraints)
                addHorizontalGlue()
            },
            horizontalPanelConstraints
        )
    }

    fun commandsPanel(project: Project) = componentPanel(
        message("codewhisperer.learn_page.commands.title"),
        listOf(
            keyShortcutsPanel(),
            keyShortcutsLinkPanel(project)
        )
    )

    // "Workshop" section components
    fun workshopPanel() = componentPanel(
        message("codewhisperer.learn_page.workshop.title"),
        listOf(
            workshopImagePanel(),
            workshopDescriptionPanel()
        )
    )

    private fun workshopImagePanel() = JPanel(GridBagLayout()).apply {
        val imageIcon = ImageIcon(LearnCodeWhispererUIComponents.javaClass.classLoader.getResource("codewhisperer/workshop.png"))
        val imageButton = JButton(imageIcon)

        imageButton.apply {
            isBorderPainted = false
            isContentAreaFilled = false
            isFocusPainted = false
            isOpaque = false
            border = BorderFactory.createEmptyBorder(0, 0, 5, 0)
            addActionListener {
                UiTelemetry.click(null as Project?, "codewhisperer_Prompt_Eng")
                BrowserUtil.browse(URI(CODEWHISPERER_WORKSHOP_URI))
            }
        }
        add(imageButton, horizontalPanelConstraints)
    }

    private fun workshopDescriptionPanel() = JPanel(GridBagLayout()).apply {
        add(JLabel(message("codewhisperer.learn_page.workshop.description.part_1")), horizontalPanelConstraints)
        add(
            JPanel(GridBagLayout()).apply {
                add(JLabel(message("codewhisperer.learn_page.workshop.description.part_2")), inlineLabelConstraints)
                add(
                    BrowserLink(
                        message("codewhisperer.learn_page.workshop.button.name"),
                        CODEWHISPERER_WORKSHOP_URI
                    ).apply {
                        addActionListener {
                            UiTelemetry.click(null as Project?, "codewhisperer_Prompt_Eng")
                        }
                    },
                    inlineLabelConstraints
                )
                addHorizontalGlue()
            },
            horizontalPanelConstraints
        )
    }

    // "Resources" section components
    fun resourcesPanel(project: Project) = componentPanel(
        message("codewhisperer.learn_page.resources.title"),
        listOf(
            resourcesDocumentationPanel(),
            resourcesFeedbackPanel(project)
        )
    )

    private fun resourcesDocumentationPanel() = JPanel(GridBagLayout()).apply {
        add(JLabel(AllIcons.Toolwindows.Documentation), inlineLabelConstraints)
        add(JLabel(" "), inlineLabelConstraints)
        add(
            BrowserLink(
                message("codewhisperer.learn_page.resources.documentation"),
                CODEWHISPERER_ONBOARDING_DOCUMENTATION_URI
            ).apply {
                addActionListener {
                    UiTelemetry.click(null as Project?, "codewhisperer_Resources_Documentation")
                }
            },
            inlineLabelConstraints
        )
        addHorizontalGlue()
    }

    private fun resourcesFeedbackPanel(project: Project) = JPanel(GridBagLayout()).apply {
        add(JLabel(AwsIcons.Misc.SMILE_GREY), inlineLabelConstraints)
        add(JLabel(" "), inlineLabelConstraints)
        add(
            ActionLink(message("codewhisperer.learn_page.resources.feedback")) {
                UiTelemetry.click(project, "codewhisperer_Resources_Feedback")
                FeedbackDialog(project, isCodeWhisperer = true).showAndGet()
            },
            inlineLabelConstraints
        )
        addHorizontalGlue()
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
        CodewhispererGettingStartedTask.CommentAsPrompt to
            TryExampleRowContext(
                message("codewhisperer.learn_page.examples.tasks.description_3"),
                taskTypeToFilename[CodewhispererGettingStartedTask.CommentAsPrompt]
            ),
        CodewhispererGettingStartedTask.UnitTest to
            TryExampleRowContext(
                message("codewhisperer.learn_page.examples.tasks.description_4"),
                taskTypeToFilename[CodewhispererGettingStartedTask.UnitTest]
            ),
        CodewhispererGettingStartedTask.Navigation to
            TryExampleRowContext(
                message("codewhisperer.learn_page.examples.tasks.description_5"),
                taskTypeToFilename[CodewhispererGettingStartedTask.Navigation]
            )
    )

    private fun tryExampleRow(project: Project, taskType: CodewhispererGettingStartedTask, isEvenRow: Boolean = false): JPanel {
        val tryExampleRowContext = tryExampleRowContexts[taskType] ?: return JPanel()

        return JPanel(GridBagLayout()).apply {
            val buttonSuffix = LearnCodeWhispererManager.getInstance(project).getButtonSuffix()
            add(JLabel(tryExampleRowContext.description), tryExampleLabelConstraints)
            addHorizontalGlue()
            val button = JButton(message("codewhisperer.learn_page.examples.tasks.button", buttonSuffix)).apply {
                isOpaque = !isEvenRow

                addActionListener {
                    val currentLanguage = LearnCodeWhispererManager.getInstance(project).language
                    val fileContext = tryExampleFileContexts[taskType]?.get(currentLanguage) ?: return@addActionListener
                    val fileContent = fileContext.first
                    val caretOffset = fileContext.second
                    CodeWhispererTelemetryService.getInstance().sendOnboardingClickEvent(currentLanguage, taskType)
                    val fileExtension = LearnCodeWhispererManager.getInstance(project).getFileExtension()
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
            LearnCodeWhispererManager.getInstance(project).tryExampleButtons.add(button)

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
                UiTelemetry.click(null as Project?, "codewhisperer_GenerateSuggestions_LearnMore")
            },
            inlineLabelConstraints
        )
        add(JLabel(message("codewhisperer.learn_page.examples.description.part_3")), inlineLabelConstraints)
        addHorizontalGlue()
    }

    // "Code Scan" section components
    val codeScanDescriptionPanel = JPanel(GridBagLayout()).apply {
        add(JLabel(message("codewhisperer.learn_page.codescan.description")), inlineLabelConstraints)
        add(
            BrowserLink(
                message("codewhisperer.learn_page.learn_more"),
                CODEWHISPERER_CODE_SCAN_LEARN_MORE_URI
            ).apply {
                addActionListener {
                    UiTelemetry.click(null as Project?, "codewhisperer_ScanCode_LearnMore")
                }
            },
            inlineLabelConstraints
        )
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
        LearnCodeWhispererManager.getInstance(project).tryExampleButtons.clear()
        val firstTryExampleRow = tryExampleRow(project, CodewhispererGettingStartedTask.AutoTrigger)
        val secondTryExampleRow = tryExampleRow(project, CodewhispererGettingStartedTask.ManualTrigger, true)
        val thirdTryExampleRow = tryExampleRow(project, CodewhispererGettingStartedTask.CommentAsPrompt)
        val fourthTryExampleRow = tryExampleRow(project, CodewhispererGettingStartedTask.Navigation, true)
        val fifthTryExampleRow = tryExampleRow(project, CodewhispererGettingStartedTask.UnitTest)
        add(firstTryExampleRow, tryExampleRowConstraints)
        add(secondTryExampleRow, tryExampleRowConstraints)
        add(thirdTryExampleRow, tryExampleRowConstraints)
        add(fourthTryExampleRow, tryExampleRowConstraints)
        add(fifthTryExampleRow, tryExampleRowConstraints)
        border = BorderFactory.createLineBorder(POPUP_BUTTON_BORDER)
    }

    fun componentPanel(title: String, children: List<JComponent>) = JPanel(GridBagLayout()).apply {
        add(componentTitle(title), componentPanelConstraints)
        children.forEach { add(it, componentPanelConstraints) }
        border = BorderFactory.createCompoundBorder(
            BorderFactory.createLineBorder(POPUP_BUTTON_BORDER, 1, true),
            BorderFactory.createEmptyBorder(11, 18, 11, 18)
        )
    }

    private fun componentTitle(text: String) = JLabel(text).apply {
        font = font.deriveFont(16f).deriveFont(Font.BOLD)
        border = BorderFactory.createEmptyBorder(0, 0, 6, 0)
    }
}

class CustomRadiusRoundedBorder(private val thickness: Int, private val radius: Int, private val color: Color) : AbstractBorder() {
    override fun paintBorder(c: Component, g: Graphics, x: Int, y: Int, width: Int, height: Int) {
        super.paintBorder(c, g, x, y, width, height)
        val g2d = g as Graphics2D
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        g2d.color = color
        g2d.drawRoundRect(x, y, width - thickness, height - thickness, radius, radius)
    }

    override fun getBorderInsets(c: Component) = JBUI.insets(thickness, thickness, thickness, thickness)
}
