// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.execution

import com.intellij.docker.dockerFile.DockerFileType
import com.intellij.docker.dockerFile.parser.psi.DockerPsiCommand
import com.intellij.ide.plugins.PluginManager
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.plugins.docker.dockerFile.parser.psi.DockerFileAddOrCopyCommand
import com.intellij.plugins.docker.dockerFile.parser.psi.DockerFileCmdCommand
import com.intellij.plugins.docker.dockerFile.parser.psi.DockerFileExposeCommand
import com.intellij.plugins.docker.dockerFile.parser.psi.DockerFileFromCommand
import com.intellij.plugins.docker.dockerFile.parser.psi.DockerFileWorkdirCommand
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiManager
import com.intellij.psi.impl.source.tree.LeafPsiElement
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.resources.message
import java.awt.event.ActionEvent
import java.awt.event.ActionListener
import java.io.File

object DockerUtil {
    @JvmStatic
    fun dockerPluginAvailable() = PluginId.findId("Docker")?.let { PluginManager.isPluginInstalled(it) } == true
}

class ImportFromDockerfile @JvmOverloads constructor(
    private val project: Project,
    private val view: PerContainerSettings,
    private val dockerfileParser: DockerfileParser = DockerfileParser(project)
) : ActionListener {
    override fun actionPerformed(e: ActionEvent?) {
        val file = FileChooser.chooseFile(
            FileChooserDescriptorFactory.createSingleFileDescriptor(DockerFileType.DOCKER_FILE_TYPE),
            project,
            project.guessProjectDir()
        ) ?: return
        val details = tryOrNull { dockerfileParser.parse(file) }
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

class DockerfileParser(private val project: Project) {
    fun parse(virtualFile: VirtualFile): DockerfileDetails? {
        val psiFile = PsiManager.getInstance(project).findFile(virtualFile)!!
        val contextDirectory = virtualFile.parent.path

        val lastFromCommand = psiFile.children.filterIsInstance<DockerFileFromCommand>().lastOrNull() ?: return null
        val commandsAfterLastFrom = psiFile.children.dropWhile { it != lastFromCommand }
        if (commandsAfterLastFrom.isEmpty()) {
            return null
        }

        val command = commandsAfterLastFrom.filterIsInstance<DockerFileCmdCommand>().lastOrNull()?.text?.substringAfter("CMD ")
        val portMappings = commandsAfterLastFrom.filterIsInstance<DockerFileExposeCommand>().mapNotNull {
            it.listChildren().find { child -> (child as? LeafPsiElement)?.elementType?.toString() == "INTEGER_LITERAL" }?.text?.toIntOrNull()
        }

        val copyDirectives = groupByWorkDir(commandsAfterLastFrom).flatMap { (workDir, commands) ->
            commands.filterIsInstance<DockerFileAddOrCopyCommand>()
                .filter { it.copyKeyword != null }
                .mapNotNull { cmd -> cmd.fileOrUrlList.takeIf { it.size == 2 }?.let { it.first().text to it.last().text } }
                .map { (rawLocal, rawRemote) ->
                    val local = if (rawLocal.startsWith("/") || rawLocal.startsWith(File.separatorChar)) {
                        rawLocal
                    } else {
                        "${contextDirectory.normalizeDirectory(true)}$rawLocal"
                    }
                    val remote = if (rawRemote.startsWith("/") || workDir == null) {
                        rawRemote
                    } else {
                        "${workDir.normalizeDirectory()}$rawRemote"
                    }
                    CopyDirective(local, remote)
                }
        }

        return DockerfileDetails(command, portMappings, copyDirectives)
    }

    private fun groupByWorkDir(commands: List<PsiElement>): List<Pair<String?, List<DockerPsiCommand>>> {
        val list = mutableListOf<Pair<String?, List<DockerPsiCommand>>>()
        var workDir: String? = null
        val elements = mutableListOf<DockerPsiCommand>()
        commands.forEach {
            when (it) {
                is DockerFileWorkdirCommand -> {
                    if (elements.isNotEmpty()) {
                        list.add(workDir to elements.toList())
                        elements.clear()
                    }
                    workDir = it.fileOrUrlList.first().text
                }
                is DockerPsiCommand -> elements.add(it)
            }
        }
        if (elements.isNotEmpty()) {
            list.add(workDir to elements.toList())
        }
        return list
    }

    private fun PsiElement.listChildren(): List<PsiElement> {
        var child: PsiElement? = firstChild ?: return emptyList()
        val children = mutableListOf<PsiElement>()
        while (child != null) {
            children.add(child)
            child = child.nextSibling
        }
        return children.toList()
    }
}

data class DockerfileDetails(val command: String?, val exposePorts: List<Int>, val copyDirectives: List<CopyDirective>)

data class CopyDirective(val from: String, val to: String)

fun String.normalizeDirectory(matchPlatform: Boolean = false): String {
    val ch = if (matchPlatform) File.separatorChar else '/'
    return "${trimEnd(ch)}$ch"
}
