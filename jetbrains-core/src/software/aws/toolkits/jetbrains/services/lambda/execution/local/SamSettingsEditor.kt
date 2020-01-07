// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.docker.DockerCloudConfiguration
import com.intellij.docker.DockerCloudType
import com.intellij.openapi.options.SettingsEditor
import com.intellij.remoteServer.configuration.RemoteServersManager
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.services.ecs.execution.DockerUtil.dockerPluginAvailable
import software.aws.toolkits.jetbrains.utils.ui.selected
import java.net.URI
import javax.swing.JComponent

class SamSettingsEditor : SettingsEditor<LocalLambdaRunConfiguration>() {
    private val view = SamSettingsEditorPanel()

    override fun createEditor(): JComponent {
        val hostOptions = mutableSetOf<String>()

        hostOptions.add("localhost")
        if (dockerPluginAvailable()) {
            val dockerCloudType = DockerCloudType.getInstance()
            RemoteServersManager.getInstance().servers.asSequence()
                .filter { it.type == dockerCloudType }
                .map { it.configuration }
                .filterIsInstance< DockerCloudConfiguration>()
                .mapNotNull { convertDockerApiToHost(it.apiUrl) }
                .forEach { hostOptions.add(it) }
        }
        hostOptions.forEach { view.debugHostChooser.addItem(it) }

        return view.panel
    }

    private fun convertDockerApiToHost(api: String) = LOGGER.tryOrNull("Failed to convert $api to host") {
        val apiUri = URI.create(api)
        if (apiUri.scheme != "unix") {
            apiUri.host
        } else {
            null
        }
    }

    override fun resetEditorFrom(configuration: LocalLambdaRunConfiguration) {
        view.dockerNetwork.text = configuration.dockerNetwork()
        view.debugHostChooser.selectedItem = configuration.debugHost()
        view.skipPullImage.isSelected = configuration.skipPullImage()
        view.buildInContainer.isSelected = configuration.buildInContainer()
        view.additionalBuildArgs.text = configuration.additionalBuildArgs()
        view.additionalLocalArgs.text = configuration.additionalLocalArgs()
    }

    override fun applyEditorTo(configuration: LocalLambdaRunConfiguration) {
        configuration.dockerNetwork(view.dockerNetwork.text.trim())
        configuration.debugHost(view.debugHostChooser.selected() ?: "localhost")
        configuration.skipPullImage(view.skipPullImage.isSelected)
        configuration.buildInContainer(view.buildInContainer.isSelected)
        configuration.additionalBuildArgs(view.additionalBuildArgs.text.trim())
        configuration.additionalLocalArgs(view.additionalLocalArgs.text.trim())
    }

    private companion object {
        val LOGGER = getLogger<SamSettingsEditor>()
    }
}
