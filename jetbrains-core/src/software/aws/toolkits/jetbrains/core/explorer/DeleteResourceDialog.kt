// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.ui.DocumentAdapter
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import com.intellij.ui.layout.panel
import software.aws.toolkits.resources.message
import javax.swing.JComponent
import javax.swing.event.DocumentEvent

class DeleteResourceDialog(
    project: Project,
    private val resourceType: String,
    private val resourceName: String
) : DialogWrapper(project) {
    private val deleteResourceConfirmation = JBTextField().apply { emptyText.text = message("delete_resource.confirmation_text") }
    private val warningIcon = JBLabel(Messages.getWarningIcon())
    private val component by lazy {
        panel {
            row {
                warningIcon(grow)
                right { label(message("delete_resource.message", resourceType, resourceName)) }
            }
            row {
                deleteResourceConfirmation(grow)
            }
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
