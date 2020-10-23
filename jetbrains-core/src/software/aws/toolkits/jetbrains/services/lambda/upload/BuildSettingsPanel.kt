// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.ui.IdeBorderFactory
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import javax.swing.JCheckBox
import javax.swing.JPanel

class BuildSettingsPanel : JPanel(BorderLayout()) {
    lateinit var content: JPanel
    lateinit var buildInContainerCheckbox: JCheckBox

    init {
        content.border = IdeBorderFactory.createTitledBorder(message("lambda.upload.build_settings"), false)
        add(content, BorderLayout.CENTER)
    }
}
