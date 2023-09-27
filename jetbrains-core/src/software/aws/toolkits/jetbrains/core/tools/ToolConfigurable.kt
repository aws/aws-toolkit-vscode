// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.tools

import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.options.BoundConfigurable
import com.intellij.openapi.options.SearchableConfigurable
import com.intellij.openapi.ui.emptyText
import com.intellij.ui.components.JBTextField
import com.intellij.ui.dsl.builder.Align
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.panel
import software.aws.toolkits.resources.message
import java.nio.file.Path

class ToolConfigurable : BoundConfigurable(message("executableCommon.configurable.title")), SearchableConfigurable {
    private val settings = ToolSettings.getInstance()
    private val manager = ToolManager.getInstance()
    private val panel by lazy {
        panel {
            ToolType.EP_NAME.extensionList.forEach { toolType ->
                row(toolType.displayName) {
                    textFieldWithBrowseButton(fileChooserDescriptor = FileChooserDescriptorFactory.createSingleFileDescriptor())
                        .bindText(
                            { settings.getExecutablePath(toolType) ?: "" },
                            { settings.setExecutablePath(toolType, it.takeIf { v -> v.isNotBlank() }) }
                        )
                        .validationOnInput {
                            it.textField.text.takeIf { t -> t.isNotBlank() }?.let { path ->
                                manager.validateCompatability(Path.of(path), toolType).toValidationInfo(toolType, component)
                            }
                        }.applyToComponent {
                            setEmptyText(toolType, textField as JBTextField)
                        }.resizableColumn()
                        .align(Align.FILL)

                    browserLink(message("aws.settings.learn_more"), toolType.documentationUrl())
                }
            }
        }
    }

    override fun createPanel() = panel

    override fun apply() {
        panel.apply()
    }

    override fun getId(): String = "aws.tools"

    private fun setEmptyText(toolType: ToolType<Version>, field: JBTextField) {
        val resolved = (toolType as? AutoDetectableToolType<*>)?.resolve()
        field.emptyText.text = when {
            resolved != null && toolType.getTool()?.path == resolved -> message("executableCommon.auto_resolved", resolved)
            toolType is ManagedToolType<*> -> message("executableCommon.auto_managed")
            else -> message("common.none")
        }
    }
}
