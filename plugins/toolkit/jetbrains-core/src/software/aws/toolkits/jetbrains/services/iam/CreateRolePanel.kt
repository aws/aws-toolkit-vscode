// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.iam

import com.intellij.json.JsonLanguage
import com.intellij.openapi.project.Project
import com.intellij.ui.EditorTextField
import com.intellij.ui.EditorTextFieldProvider
import com.intellij.ui.IdeBorderFactory
import com.intellij.util.ui.JBUI
import software.aws.toolkits.resources.message
import javax.swing.JPanel
import javax.swing.JTextField

class CreateRolePanel(private val project: Project) {
    lateinit var component: JPanel
        private set
    lateinit var roleName: JTextField
        private set
    lateinit var policyDocument: EditorTextField
        private set
    lateinit var assumeRolePolicyDocument: EditorTextField
        private set

    private fun createUIComponents() {
        val textFieldProvider = EditorTextFieldProvider.getInstance()
        val insets = JBUI.emptyInsets()
        policyDocument = textFieldProvider.getEditorField(JsonLanguage.INSTANCE, project, emptyList())
        policyDocument.border = IdeBorderFactory.createTitledBorder(message("iam.create.role.policy.editor.name"), false, insets)
        assumeRolePolicyDocument = textFieldProvider.getEditorField(JsonLanguage.INSTANCE, project, emptyList())
        assumeRolePolicyDocument.border = IdeBorderFactory.createTitledBorder(message("iam.create.role.trust.editor.name"), false, insets)
    }
}
