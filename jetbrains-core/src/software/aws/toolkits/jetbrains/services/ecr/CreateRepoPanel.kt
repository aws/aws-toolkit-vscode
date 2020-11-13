// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr

import com.intellij.json.JsonLanguage
import com.intellij.openapi.project.Project
import com.intellij.ui.EditorTextField
import com.intellij.ui.EditorTextFieldProvider
import com.intellij.ui.IdeBorderFactory
import com.intellij.util.ui.JBUI.emptyInsets
import software.aws.toolkits.resources.message
import javax.swing.JPanel
import javax.swing.JTextField

class CreateRepoPanel(private val project: Project, private val initialPolicy: String) {
    lateinit var component: JPanel
        private set
    lateinit var repoName: JTextField
        private set
    lateinit var policy: EditorTextField
        private set

    private fun createUIComponents() {
        policy = EditorTextFieldProvider.getInstance().getEditorField(JsonLanguage.INSTANCE, project, emptyList())
        policy.text = initialPolicy
        policy.border = IdeBorderFactory.createTitledBorder(message("general.policy"), false, emptyInsets())
        // Hide the policy component if we aren't adding a policy
        if (initialPolicy.isBlank()) {
            policy.isVisible = false
        }
    }
}
