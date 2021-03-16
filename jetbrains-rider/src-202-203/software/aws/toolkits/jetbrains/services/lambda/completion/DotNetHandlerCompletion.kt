// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.completion

import com.intellij.openapi.project.Project
import com.jetbrains.rdclient.icons.FrontendIconHost
import software.aws.toolkits.jetbrains.rider.compatability.IconModel
import javax.swing.Icon

fun completionItemToIcon(project: Project, iconId: IconModel): Icon = FrontendIconHost.getInstance(project).toIdeaIcon(iconId)
