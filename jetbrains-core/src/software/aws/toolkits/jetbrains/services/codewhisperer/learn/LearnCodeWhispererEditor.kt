// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.learn

import com.intellij.codeHighlighting.BackgroundEditorHighlighter
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorLocation
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.fileEditor.FileEditorStateLevel
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.OnePixelDivider
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.JBColor
import com.intellij.ui.SeparatorComponent
import com.intellij.ui.dsl.builder.Align
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.AlignY
import com.intellij.ui.dsl.builder.BottomGap
import com.intellij.ui.dsl.builder.Cell
import com.intellij.ui.dsl.builder.Panel
import com.intellij.ui.dsl.builder.Row
import com.intellij.ui.dsl.builder.TopGap
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.gridLayout.Gaps
import groovy.lang.Tuple
import icons.AwsIcons
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererCsharp
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJava
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJavaScript
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPython
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererTypeScript
import software.aws.toolkits.jetbrains.services.codewhisperer.learn.LearnCodeWhispererEditorProvider.Companion.NEW_ONBOARDING_UX_KEY
import software.aws.toolkits.jetbrains.services.codewhisperer.learn.LearnCodeWhispererUIComponents.bannerPanel
import software.aws.toolkits.jetbrains.services.codewhisperer.learn.LearnCodeWhispererUIComponents.codeScanDescriptionPanel
import software.aws.toolkits.jetbrains.services.codewhisperer.learn.LearnCodeWhispererUIComponents.commandsPanel
import software.aws.toolkits.jetbrains.services.codewhisperer.learn.LearnCodeWhispererUIComponents.examplesDescriptionPanel
import software.aws.toolkits.jetbrains.services.codewhisperer.learn.LearnCodeWhispererUIComponents.resourcesPanel
import software.aws.toolkits.jetbrains.services.codewhisperer.learn.LearnCodeWhispererUIComponents.tryExamplePanel
import software.aws.toolkits.jetbrains.services.codewhisperer.learn.LearnCodeWhispererUIComponents.workshopPanel
import software.aws.toolkits.resources.message
import java.awt.Font
import java.beans.PropertyChangeListener
import javax.swing.BorderFactory
import javax.swing.Icon
import javax.swing.ImageIcon
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JPanel

class LearnCodeWhispererEditor(val project: Project, val virtualFile: VirtualFile) : UserDataHolderBase(), FileEditor {
    private val languageButtons = mutableListOf<Cell<JButton>>()
    private val contentPanel = panel {
        row {
            panel {
                customize(Gaps(0, 50, 0, 0))
                row {
                    icon(AwsIcons.Logos.CODEWHISPERER_LARGE)

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
            // Left panel
            panel {
                customize(Gaps(0, 50, 0, 0))
                align(AlignY.TOP)
                addToLeftPanel(commandsPanel(project))
                addToLeftPanel(workshopPanel())
                addToLeftPanel(resourcesPanel(project))
            }

            // Right panel
            panel {
                customize(Gaps(0, 40, 50, 60))
                align(AlignY.TOP)

                title(message("codewhisperer.learn_page.examples.title"))
                row {
                    cell(examplesDescriptionPanel)
                }.bottomGap(BottomGap.MEDIUM)
                buttonsGroup {
                    row {
                        val javaButton = learnCodeWhispererLanguageButton(CodeWhispererJava.INSTANCE)
                        val pythonButton = learnCodeWhispererLanguageButton(CodeWhispererPython.INSTANCE)
                        val javascriptButton = learnCodeWhispererLanguageButton(CodeWhispererJavaScript.INSTANCE)
                        val typescriptButton = learnCodeWhispererLanguageButton(CodeWhispererTypeScript.INSTANCE)
                        val csharpButton = learnCodeWhispererLanguageButton(CodeWhispererCsharp.INSTANCE)
                        languageButtons.add(javaButton)
                        languageButtons.add(pythonButton)
                        languageButtons.add(javascriptButton)
                        languageButtons.add(typescriptButton)
                        languageButtons.add(csharpButton)
                        javaButton.component.doClick()
                    }.bottomGap(BottomGap.MEDIUM)
                }
                row {
                    cell(tryExamplePanel(project)).widthGroup(RIGHT_PANEL_WIDTH_GROUP)
                }.bottomGap(BottomGap.MEDIUM)

                // A separator with width adjusted to its sibling components
                row {
                    cell(SeparatorComponent(0, OnePixelDivider.BACKGROUND, null))
                        .widthGroup(RIGHT_PANEL_WIDTH_GROUP)
                }.bottomGap(BottomGap.MEDIUM)

                title(message("codewhisperer.learn_page.codescan.title"))
                row {
                    cell(codeScanDescriptionPanel)
                }.bottomGap(BottomGap.SMALL)
                row {
                    icon(ImageIcon(LearnCodeWhispererUIComponents.javaClass.classLoader.getResource("codewhisperer/codescan.png")))
                        .widthGroup(RIGHT_PANEL_WIDTH_GROUP).align(AlignX.LEFT)
                }
            }
        }
    }
    private val banner = panel {
        panel {
            customize(Gaps(10, 20, 10, 10))
            row {
                cell(bannerPanel()).resizableColumn().align(Align.FILL)
            }
        }
    }.apply {
        background = JBColor.BLUE.darker().darker()
    }
    private val rootPanel = panel {
        val hasUserSeenNewUX = virtualFile.getUserData(NEW_ONBOARDING_UX_KEY) ?: false
        if (!hasUserSeenNewUX) {
            row {
                cell(banner).resizableColumn().align(Align.FILL)
            }
        }
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

    private fun Row.learnCodeWhispererLanguageButton(buttonLanguage: CodeWhispererProgrammingLanguage): Cell<JButton> {
        val buttonContext = when (buttonLanguage) {
            CodeWhispererJava.INSTANCE -> Tuple("Java ", AwsIcons.Misc.JAVA)
            CodeWhispererPython.INSTANCE -> Tuple("Python ", AwsIcons.Misc.PYTHON)
            CodeWhispererJavaScript.INSTANCE -> Tuple("JavaScript ", AwsIcons.Misc.JAVASCRIPT)
            CodeWhispererTypeScript.INSTANCE -> Tuple("TypeScript ", AwsIcons.Misc.TYPESCRIPT)
            CodeWhispererCsharp.INSTANCE -> Tuple("C# ", AwsIcons.Misc.CSHARP)
            else -> Tuple("Java ", AwsIcons.Misc.JAVA)
        }
        val text = buttonContext[0] as String
        val buttonIcon = buttonContext[1] as Icon

        return button(text) {
            LearnCodeWhispererManager.getInstance(project).language = buttonLanguage
            languageButtons.forEach { button ->
                button.applyToComponent {
                    border = BorderFactory.createEmptyBorder(3, 3, 3, 3)
                    font = font.deriveFont(Font.PLAIN)
                }
            }
            languageButtons.filter { button -> button.component.text == text }[0].applyToComponent {
                border = BorderFactory.createCompoundBorder(
                    CustomRadiusRoundedBorder(1, 30, JBColor.BLUE),
                    BorderFactory.createEmptyBorder(2, 2, 2, 2)
                )
                font = font.deriveFont(Font.BOLD)
            }
        }.applyToComponent {
            icon = buttonIcon
            isOpaque = false
            isContentAreaFilled = false
            border = BorderFactory.createEmptyBorder(3, 3, 3, 3)
            isSelected = LearnCodeWhispererManager.getInstance(project).language == buttonLanguage
        }.customize(Gaps(0, 10, 2, 10))
    }

    private fun Panel.title(text: String) = row {
        label(text).bold().applyToComponent { font = font.deriveFont(24f) }
    }

    private fun Panel.addToLeftPanel(panel: JPanel) = row {
        cell(panel).widthGroup(LEFT_PANEL_WIDTH_GROUP).customize(Gaps(22, 18, 11, 18))
    }.bottomGap(BottomGap.MEDIUM)

    companion object {
        private const val LEFT_PANEL_WIDTH_GROUP = "leftPanel"
        private const val RIGHT_PANEL_WIDTH_GROUP = "rightPanel"
    }
}
