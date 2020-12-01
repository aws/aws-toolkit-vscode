// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.components.fields.ExpandableTextField
import javax.swing.JCheckBox
import javax.swing.JPanel
import javax.swing.JTextField

class SamSettingsEditorPanel {
    lateinit var buildInContainer: JCheckBox
    lateinit var dockerNetwork: JTextField
    lateinit var skipPullImage: JCheckBox
    lateinit var panel: JPanel
    lateinit var additionalBuildArgs: ExpandableTextField
    lateinit var additionalLocalArgs: ExpandableTextField
    lateinit var debugHostChooser: ComboBox<String>
}
