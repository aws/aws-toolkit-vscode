// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import com.jetbrains.rider.projectView.solution
import software.aws.toolkits.jetbrains.protocol.awsSettingModel

/**
 * Syncs any required settings over to the Rider backend
 */
class RiderSyncSettings : StartupActivity {
    @Override
    override fun runActivity(project: Project) {
        project.solution.awsSettingModel.showLambdaGutterMarks.fire(LambdaSettings.getInstance(project).showAllHandlerGutterIcons)
    }
}
