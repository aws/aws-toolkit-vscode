// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.openapi.options.SettingsEditor
import javax.swing.JComponent

class SamSettingsEditor : SettingsEditor<LocalLambdaRunConfiguration>() {
    private val view = SamSettingsEditorPanel()

    override fun createEditor(): JComponent = view.panel

    override fun resetEditorFrom(configuration: LocalLambdaRunConfiguration) {
        view.dockerNetwork.text = configuration.dockerNetwork()
        view.skipPullImage.isSelected = configuration.skipPullImage()
        view.buildInContainer.isSelected = configuration.buildInContainer()
        view.additionalBuildArgs.text = configuration.additionalBuildArgs()
        view.additionalLocalArgs.text = configuration.additionalLocalArgs()
    }

    override fun applyEditorTo(configuration: LocalLambdaRunConfiguration) {
        configuration.dockerNetwork(view.dockerNetwork.text.trim())
        configuration.skipPullImage(view.skipPullImage.isSelected)
        configuration.buildInContainer(view.buildInContainer.isSelected)
        configuration.additionalBuildArgs(view.additionalBuildArgs.text.trim())
        configuration.additionalLocalArgs(view.additionalLocalArgs.text.trim())
    }
}