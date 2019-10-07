// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.project.Project
import com.jetbrains.rdclient.util.idea.LifetimedProjectComponent
import com.jetbrains.rider.model.lambdaPsiModel
import com.jetbrains.rider.projectView.solution

@Suppress("ComponentNotRegistered")
class LambdaPsiHost(project: Project) : LifetimedProjectComponent(project) {

    val model = project.solution.lambdaPsiModel
}
