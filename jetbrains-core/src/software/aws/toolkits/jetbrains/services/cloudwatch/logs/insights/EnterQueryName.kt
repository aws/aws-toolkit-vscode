// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.openapi.project.Project
import javax.swing.JPanel
import javax.swing.JTextField

class EnterQueryName(project: Project) {
    lateinit var queryName: JTextField
    lateinit var saveQueryPanel: JPanel
}
