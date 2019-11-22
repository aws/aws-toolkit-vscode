// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.actions

import com.intellij.openapi.Disposable
import com.intellij.openapi.ui.Messages
import com.intellij.ui.components.JBLabel
import software.aws.toolkits.resources.message
import javax.swing.JCheckBox
import javax.swing.JPanel

class ConfirmNonProductionDialog(serviceName: String) : Disposable {
    lateinit var content: JPanel
    lateinit var confirmProceed: JCheckBox
    lateinit var warning: JBLabel

    init {
        warning.text = message("cloud_debug.instrument.production_warning.text")
        warning.icon = Messages.getWarningIcon()
        warning.iconTextGap = 8
        confirmProceed.text = message("cloud_debug.instrument.production_warning.checkbox_label", serviceName)
    }

    override fun dispose() {}
}
