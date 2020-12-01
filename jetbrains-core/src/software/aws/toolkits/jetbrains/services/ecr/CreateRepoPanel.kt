// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr

import com.intellij.openapi.project.Project
import javax.swing.JPanel
import javax.swing.JTextField

class CreateRepoPanel(private val project: Project) {
    lateinit var component: JPanel
        private set
    lateinit var repoName: JTextField
        private set
}
