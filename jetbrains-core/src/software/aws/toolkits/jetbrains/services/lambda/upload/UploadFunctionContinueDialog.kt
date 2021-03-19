// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import com.intellij.ui.layout.panel
import software.aws.toolkits.resources.message
import javax.swing.JComponent

// TODO we can add `Filter`s to the step executor which will allow us to take
// actions on certain text, so we can put it in the output window to click to continue
class UploadFunctionContinueDialog(private val project: Project, private val changeSet: String) : DialogWrapper(project) {
    init {
        super.init()
        title = message("serverless.application.deploy.change_set.title")
        setOKButtonText(message("serverless.application.deploy.execute_change_set"))
        setCancelButtonText(message("general.close_button"))
    }

    override fun createCenterPanel(): JComponent = panel {
        row {
            JBLabel(message("serverless.application.deploy.change_set"))()
            JBTextField(changeSet).apply { this.isEditable = false }()
        }
    }
}
