// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.project.Project
import com.intellij.util.messages.MessageBus
import com.jetbrains.rider.model.awsSettingModel
import com.jetbrains.rider.projectView.solution

class LambdaGutterMarkSettings(project: Project, messageBus: MessageBus) {

    val model = project.solution.awsSettingModel

    init {
        model.showLambdaGutterMarks.fire(LambdaSettings.getInstance(project).showAllHandlerGutterIcons)

        messageBus.connect().subscribe(
            LambdaSettingsChangeListener.TOPIC,
            object : LambdaSettingsChangeListener {
                override fun samShowAllHandlerGutterIconsSettingsChange(isShow: Boolean) {
                    model.showLambdaGutterMarks.fire(isShow)
                }
            }
        )
    }
}
