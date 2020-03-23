// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.project

import com.intellij.openapi.project.Project
import com.jetbrains.rdclient.util.idea.LifetimedProjectComponent
import com.jetbrains.rider.model.awsProjectModel
import com.jetbrains.rider.projectView.solution

@Suppress("ComponentNotRegistered")
class AwsProjectHost(project: Project) : LifetimedProjectComponent(project) {

    val model = project.solution.awsProjectModel
}
