// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.ui.IdeBorderFactory
import com.intellij.ui.components.JBRadioButton
import com.intellij.ui.components.panels.Wrapper
import com.intellij.util.ui.JBUI
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaInputPanel
import software.aws.toolkits.resources.message
import javax.swing.JCheckBox
import javax.swing.JPanel

class LocalLambdaRunSettingsEditorPanel(private val project: Project) {
    lateinit var panel: JPanel
        private set
    lateinit var invalidator: JCheckBox
        private set
    lateinit var lambdaInputPanel: JPanel
        private set
    lateinit var lambdaInput: LambdaInputPanel
        private set
    private lateinit var raw: JBRadioButton
    private lateinit var template: JBRadioButton
    private lateinit var settings: Wrapper

    val rawSettings = RawSettings(project)
    val templateSettings = TemplateSettings(project)
    var useTemplate: Boolean
        get() = template.isSelected
        set(value) {
            if (value) {
                template.isSelected = true
                settings.setContent(templateSettings.panel)
            } else {
                raw.isSelected = true
                settings.setContent(rawSettings.panel)
            }
        }

    private fun createUIComponents() {
        lambdaInput = LambdaInputPanel(project)
    }

    init {
        template.addActionListener {
            settings.setContent(templateSettings.panel)
            invalidateConfiguration()
        }
        raw.addActionListener {
            settings.setContent(rawSettings.panel)
            invalidateConfiguration()
        }
        // Select template by default
        template.isSelected = true
        settings.setContent(templateSettings.panel)

        lambdaInputPanel.border = IdeBorderFactory.createTitledBorder(message("lambda.input.label"), false, JBUI.emptyInsets())
    }

    fun invalidateConfiguration() {
        runInEdt { invalidator.isSelected = !invalidator.isSelected }
    }
}
