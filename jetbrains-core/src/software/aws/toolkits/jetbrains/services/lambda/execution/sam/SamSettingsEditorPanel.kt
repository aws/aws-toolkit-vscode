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
        private set
    lateinit var dockerNetwork: JTextField
        private set
    lateinit var skipPullImage: JCheckBox
        private set
    lateinit var panel: JPanel
        private set
    lateinit var additionalBuildArgs: ExpandableTextField
        private set
    lateinit var additionalLocalArgs: ExpandableTextField
        private set
    lateinit var debugHostChooser: ComboBox<String>
        private set
}
