// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ModifiableRootModel
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.text.SemVer
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationTemplate
import software.aws.toolkits.jetbrains.services.cloudformation.SERVERLESS_FUNCTION_TYPE
import software.aws.toolkits.jetbrains.settings.SamSettings
import software.aws.toolkits.resources.message
import java.nio.file.Paths

class SamCommon {
    companion object {
        val SAM_BUILD_DIR = ".aws-sam"

        val expectedSamMinVersion = SemVer("0.7.0", 0, 7, 0)
        private val expectedSamMaxVersion = SemVer("0.8.0", 0, 8, 0)

        fun checkVersion(samVersionLine: String): String? {
            val parsedSemVer = SemVer.parseFromText(samVersionLine.split(" ").last())
                    ?: return message("sam.executable.version_parse_error", samVersionLine)

            val samVersionOutOfRangeMessage = message("sam.executable.version_wrong", expectedSamMinVersion, expectedSamMaxVersion, parsedSemVer)
            if (parsedSemVer >= expectedSamMaxVersion) {
                return "$samVersionOutOfRangeMessage ${message("sam.executable.version_too_high")}"
            } else if (parsedSemVer < expectedSamMinVersion) {
                return "$samVersionOutOfRangeMessage ${message("sam.executable.version_too_low")}"
            }
            return null
        }

        fun validate(path: String? = SamSettings.getInstance().executablePath): String? {
            path ?: return message("lambda.run_configuration.sam.not_specified")
            val commandLine = GeneralCommandLine(path).withParameters("--version")
            return try {
                val process = CapturingProcessHandler(commandLine).runProcess()
                if (process.exitCode != 0) {
                    process.stderr
                } else {
                    val samVersionLine = process.stdoutLines.first()
                    checkVersion(samVersionLine)
                }
            } catch (e: Exception) {
                e.localizedMessage
            }
        }

        fun getTemplateFromDirectory(projectRoot: VirtualFile): VirtualFile? {
            val yamlFiles = VfsUtil.getChildren(projectRoot).filter { it.name.endsWith("yaml") || it.name.endsWith("yml") }
            assert(yamlFiles.size == 1) { println(message("cloudformation.yaml.too_many_files", yamlFiles.size)) }
            return yamlFiles.first()
        }

        fun getCodeUrisFromTemplate(project: Project, template: VirtualFile?): List<VirtualFile> {
            template ?: return listOf()
            val cfTemplate = CloudFormationTemplate.parse(project, template)

            val codeUris = mutableListOf<VirtualFile>()

            cfTemplate.resources().filter { it.isType(SERVERLESS_FUNCTION_TYPE) }.forEach { resource ->
                val codeUriValue = resource.getScalarProperty("CodeUri")
                project.baseDir.findFileByRelativePath(codeUriValue)?.takeIf { it.isDirectory }?.let { codeUri ->
                    codeUris.add(codeUri)
                }
            }
            return codeUris
        }

        fun setSourceRoots(projectRoot: VirtualFile, project: Project, modifiableModel: ModifiableRootModel) {
            val template = SamCommon.getTemplateFromDirectory(projectRoot)
            val codeUris = SamCommon.getCodeUrisFromTemplate(project, template)
            modifiableModel.contentEntries.forEach { contentEntry ->
                if (contentEntry.file == projectRoot) {
                    codeUris.forEach { contentEntry.addSourceFolder(it, false) }
                }
            }
        }

        fun excludeSamDirectory(projectRoot: VirtualFile, modifiableModel: ModifiableRootModel) {
            modifiableModel.contentEntries.forEach { contentEntry ->
                if (contentEntry.file == projectRoot) {
                    contentEntry.addExcludeFolder(VfsUtilCore.pathToUrl(Paths.get(projectRoot.path, SAM_BUILD_DIR).toString()))
                }
            }
        }
    }
}