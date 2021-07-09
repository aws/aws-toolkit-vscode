// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.execution

import com.intellij.docker.dockerFile.DockerFileType
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.ui.Messages
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.plugins.pluginIsInstalledAndEnabled
import software.aws.toolkits.jetbrains.services.ecs.execution.docker.DockerfileParser
import software.aws.toolkits.resources.message
import java.awt.event.ActionEvent
import java.awt.event.ActionListener

object DockerUtil {
    @JvmStatic
    fun dockerPluginAvailable() = pluginIsInstalledAndEnabled("Docker")
}

class ImportFromDockerfile(
    private val project: Project,
    private val view: PerContainerSettings,
) : ActionListener {
    override fun actionPerformed(e: ActionEvent?) {
        val file = FileChooser.chooseFile(
            FileChooserDescriptorFactory.createSingleFileDescriptor(DockerFileType.DOCKER_FILE_TYPE),
            project,
            project.guessProjectDir()
        ) ?: return
        val details = tryOrNull { DockerfileParser(project).parse(file) }
        if (details == null) {
            Messages.showWarningDialog(
                view.component,
                message("cloud_debug.ecs.run_config.unsupported_dockerfile", file),
                message("cloud_debug.ecs.run_config.unsupported_dockerfile.title")
            )
            return
        }

        details.command?.let { view.startCommand.command = it }
        details.exposePorts.map { PortMapping(remotePort = it) }.takeIf { it.isNotEmpty() }?.let { view.portMappingsTable.setValues(it) }
        details.copyDirectives.map { ArtifactMapping(it.from, it.to) }.takeIf { it.isNotEmpty() }?.let { view.artifactMappingsTable.setValues(it) }
    }
}
