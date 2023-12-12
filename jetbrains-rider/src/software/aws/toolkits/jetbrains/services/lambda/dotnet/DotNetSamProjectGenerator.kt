// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import com.intellij.openapi.module.ModuleManager
import com.intellij.openapi.progress.DumbProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.rootManager
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.jetbrains.rider.ideaInterop.fileTypes.msbuild.CsprojFileType
import com.jetbrains.rider.projectView.SolutionManager
import com.jetbrains.rider.projectView.actions.projectTemplating.backend.ReSharperTemplatesInteraction
import com.jetbrains.rider.projectView.actions.projectTemplating.impl.ProjectTemplateDialogContext
import com.jetbrains.rider.projectView.actions.projectTemplating.impl.ProjectTemplateTransferableModel
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.core.coroutines.applicationCoroutineScope
import software.aws.toolkits.resources.message
import java.io.File

class DotNetSamProjectGenerator(
    private val context: ProjectTemplateDialogContext,
    group: String,
    categoryName: String,
    model: ProjectTemplateTransferableModel
) : DotNetSamProjectGeneratorRoot(context, group, categoryName, model) {
    override fun expand() = Runnable {
        val samPanel = getSamPanel()
        val generator = getSamGenerator()
        val samSettings = samPanel.getNewProjectSettings()

        val solutionDirectory = getSolutionDirectory()
            ?: throw Exception(message("sam.init.error.no.solution.basepath"))

        val fileSystem = LocalFileSystem.getInstance()
        if (!solutionDirectory.exists()) {
            FileUtil.createDirectory(solutionDirectory)
        }

        val outDirVf = fileSystem.refreshAndFindFileByIoFile(solutionDirectory)
            ?: throw Exception(message("sam.init.error.no.virtual.file"))

        val progressManager = ProgressManager.getInstance()
        val samProjectBuilder = generator.createModuleBuilder()
        progressManager.runProcessWithProgressSynchronously(
            {
                samProjectBuilder.runSamInit(
                    context.project,
                    projectNameField.text,
                    samSettings,
                    null,
                    outDirVf
                )
            },
            message("sam.init.generating.template"),
            false,
            null
        )

        // Create solution file
        val projectFiles =
            File(solutionDirectory, "src").walk().filter { it.extension == CsprojFileType.defaultExtension } +
                File(solutionDirectory, "test").walk().filter { it.extension == CsprojFileType.defaultExtension }

        // Get the rest of generated files and copy to "SolutionItems" default folder in project structure
        val solutionFiles = solutionDirectory.listFiles()?.filter { it.isFile }?.toList() ?: emptyList()

        val solutionFile = ReSharperTemplatesInteraction.createSolution(
            name = getSolutionName(),
            directory = solutionDirectory,
            projectFiles = projectFiles.toList(),
            protocolHost = context.protocolHost,
            solutionFiles = solutionFiles
        ) ?: throw Exception(message("sam.init.error.solution.create.fail"))

        applicationCoroutineScope().launch {
            val project =
                SolutionManager.openExistingSolution(
                    projectToClose = null,
                    forceOpenInNewFrame = false,
                    solutionFile = solutionFile,
                    forceConsiderTrusted = true
                ) ?: return@launch
            vcsPanel?.createInitializer()?.execute(project)

            val modifiableModel = ModuleManager.getInstance(project).modules.firstOrNull()?.rootManager?.modifiableModel ?: return@launch
            try {
                val progressIndicator = if (progressManager.hasProgressIndicator()) progressManager.progressIndicator else DumbProgressIndicator()

                samProjectBuilder.runPostSamInit(project, modifiableModel, progressIndicator, samSettings, outDirVf)
            } finally {
                modifiableModel.dispose()
            }
        }
    }
}
