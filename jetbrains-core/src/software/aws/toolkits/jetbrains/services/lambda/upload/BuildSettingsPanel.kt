// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.ui.IdeBorderFactory
import software.amazon.awssdk.services.lambda.model.PackageType
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import javax.swing.JCheckBox
import javax.swing.JPanel
import kotlin.properties.Delegates

class BuildSettingsPanel : JPanel(BorderLayout()) {
    lateinit var content: JPanel
        private set
    lateinit var buildInContainerCheckbox: JCheckBox
        private set

    var packagingType: PackageType by Delegates.observable(PackageType.ZIP) { _, _, _ -> updateComponents() }

    init {
        content.border = IdeBorderFactory.createTitledBorder(message("lambda.upload.build_settings"), false)
        add(content, BorderLayout.CENTER)
    }

    private fun updateComponents() {
        content.isVisible = packagingType == PackageType.ZIP
    }
}
