// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.sam

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.text.SemVer
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.getExecutableIfPresent
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationTemplate
import software.aws.toolkits.jetbrains.services.cloudformation.SERVERLESS_FUNCTION_TYPE
import software.aws.toolkits.resources.message
import java.io.FileFilter
import java.nio.file.Paths

object SamCommon {
    val mapper = jacksonObjectMapper()
    const val SAM_BUILD_DIR = ".aws-sam"
    const val SAM_INFO_VERSION_KEY = "version"
    const val SAM_INVALID_OPTION_SUBSTRING = "no such option"
    const val SAM_NAME = "SAM CLI"

    // The minimum SAM CLI version required for images. TODO remove when sam min > 1.13.0
    val minImageVersion = SemVer("1.13.0", 1, 13, 0)

    /**
     * @return The string representation of the SAM version else "UNKNOWN"
     */
    fun getVersionString(): String = ExecutableManager.getInstance().getExecutableIfPresent<SamExecutable>().version ?: "UNKNOWN"

    fun getTemplateFromDirectory(projectRoot: VirtualFile): VirtualFile? {
        // Use Java File so we don't need to do a full VFS refresh
        val projectRootFile = VfsUtil.virtualToIoFile(projectRoot)
        val yamlFiles = projectRootFile.listFiles(
            FileFilter {
                it.isFile && it.name.endsWith("yaml") || it.name.endsWith("yml")
            }
        )?.toList() ?: emptyList()
        assert(yamlFiles.size == 1) { message("cloudformation.yaml.too_many_files", yamlFiles.size) }
        return LocalFileSystem.getInstance().refreshAndFindFileByIoFile(yamlFiles.first())
    }

    fun getCodeUrisFromTemplate(project: Project, template: VirtualFile): List<VirtualFile> {
        val templatePath = Paths.get(template.parent.path)

        val codeDirs = runReadAction {
            val cfTemplate = CloudFormationTemplate.parse(project, template)

            cfTemplate.resources()
                .filter { it.isType(SERVERLESS_FUNCTION_TYPE) }
                .map { templatePath.resolve(it.getScalarProperty("CodeUri")) }
                .toList()
        }

        val localFileSystem = LocalFileSystem.getInstance()
        return codeDirs.mapNotNull { localFileSystem.refreshAndFindFileByIoFile(it.toFile()) }
            .filter { it.isDirectory }
    }
}
