// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.json.JsonLanguage
import com.intellij.openapi.project.Project
import com.intellij.ui.EditorTextField
import com.intellij.ui.EditorTextFieldProvider
import com.intellij.ui.components.JBLabel
import javax.swing.JPanel

class ConfirmPolicyPanel(
    private val project: Project,
    warning: String
) {
    lateinit var component: JPanel
        private set
    lateinit var policyDocument: EditorTextField
        private set
    lateinit var warningText: JBLabel
        private set

    init {
        warningText.text = warning
    }

    private fun createUIComponents() {
        policyDocument = EditorTextFieldProvider.getInstance().getEditorField(JsonLanguage.INSTANCE, project, emptyList())
    }
}
