// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.project.Project
import com.jetbrains.rider.projectView.solution
import software.aws.toolkits.jetbrains.protocol.awsSettingModel

class LambdaGutterMarkSettings(private val project: Project) : LambdaSettingsChangeListener {
    override fun samShowAllHandlerGutterIconsSettingsChange(isShow: Boolean) {
        project.solution.awsSettingModel.showLambdaGutterMarks.fire(isShow)
    }
}
