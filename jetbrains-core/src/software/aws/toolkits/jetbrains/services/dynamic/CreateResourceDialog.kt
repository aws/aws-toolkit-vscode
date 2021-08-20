// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.layout.jbTextField
import com.intellij.ui.layout.panel
import javax.swing.JComponent

class CreateResourceDialog(project: Project): DialogWrapper(project) {
    private var resourceName: String = ""
    private val component by lazy{
        panel{
            row("Resource Name"){
                textField()
            }
        }
    }
    override fun createCenterPanel(): JComponent? = component
}
