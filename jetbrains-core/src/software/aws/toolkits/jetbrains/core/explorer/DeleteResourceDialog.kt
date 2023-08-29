// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.ui.DocumentAdapter
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import com.intellij.ui.dsl.builder.Align
import com.intellij.ui.dsl.builder.panel
import software.aws.toolkits.resources.message
import javax.swing.JComponent
import javax.swing.event.DocumentEvent

class DeleteResourceDialog(
    project: Project,
    private val resourceType: String,
    private val resourceName: String,
    private val comment: String = ""
) : DialogWrapper(project) {
    private val deleteResourceConfirmation = JBTextField().apply {
        emptyText.text = message("delete_resource.confirmation_text")
        accessibleContext.accessibleName = message("general.delete_accessible_name")
    }

    private val warningIcon = JBLabel(Messages.getWarningIcon())
    private val component by lazy {
        panel {
            row {
                cell(warningIcon)
                label(message("delete_resource.message", resourceType, resourceName))
            }
            row {
                cell(deleteResourceConfirmation).align(Align.FILL)
            }
            row { }.comment(comment).visible(this@DeleteResourceDialog.comment.isNotBlank())
        }
    }

    init {
        super.init()
        title = message("delete_resource.title", resourceType, resourceName)
        okAction.isEnabled = false
        deleteResourceConfirmation.document.addDocumentListener(
            object : DocumentAdapter() {
                override fun textChanged(e: DocumentEvent) {
                    isOKActionEnabled = deleteResourceConfirmation.text == message("delete_resource.confirmation_text")
                }
            }
        )
    }

    override fun createCenterPanel(): JComponent = component
}
