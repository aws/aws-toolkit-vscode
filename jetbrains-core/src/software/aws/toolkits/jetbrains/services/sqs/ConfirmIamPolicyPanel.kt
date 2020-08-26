// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.sqs

import com.intellij.json.JsonLanguage
import com.intellij.openapi.project.Project
import com.intellij.ui.EditorTextField
import com.intellij.ui.EditorTextFieldProvider
import com.intellij.ui.components.JBLabel
import software.aws.toolkits.resources.message
import java.util.Collections
import javax.swing.JPanel

class ConfirmIamPolicyPanel(private val project: Project) {
    lateinit var component: JPanel
    lateinit var policyDocument: EditorTextField
    lateinit var warningText: JBLabel

    init {
        warningText.text = message("sqs.confirm.iam.warning.text")
    }

    private fun createUIComponents() {
        policyDocument = EditorTextFieldProvider.getInstance().getEditorField(JsonLanguage.INSTANCE, project, Collections.emptyList())
    }
}
