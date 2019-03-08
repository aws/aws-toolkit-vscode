// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local;

import javax.swing.JCheckBox;
import javax.swing.JPanel;
import javax.swing.JTextField;

public class SamSettingsEditorPanel {
    JCheckBox buildInContainer;
    JTextField dockerNetwork;
    JCheckBox skipPullImage;
    JPanel panel;
}
