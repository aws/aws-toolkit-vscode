// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.sam

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ModifiableRootModel
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.getExecutableIfPresent
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationTemplate
import software.aws.toolkits.jetbrains.services.cloudformation.SERVERLESS_FUNCTION_TYPE
import software.aws.toolkits.resources.message
import java.io.FileFilter
import java.nio.file.Paths

class SamCommon {
    companion object {
        private val logger = getLogger<SamCommon>()

        val mapper = jacksonObjectMapper()
        const val SAM_BUILD_DIR = ".aws-sam"
        const val SAM_INFO_VERSION_KEY = "version"
        const val SAM_INVALID_OPTION_SUBSTRING = "no such option"
        const val SAM_NAME = "SAM CLI"

        /**
         * @return The string representation of the SAM version else "UNKNOWN"
         */
        fun getVersionString(): String = ExecutableManager.getInstance().getExecutableIfPresent<SamExecutable>().version ?: "UNKNOWN"

        fun getTemplateFromDirectory(projectRoot: VirtualFile): VirtualFile? {
            // Use Java File so we don't need to do a full VFS refresh
            val projectRootFile = VfsUtil.virtualToIoFile(projectRoot)
            val yamlFiles = projectRootFile.listFiles(FileFilter {
                it.isFile && it.name.endsWith("yaml") || it.name.endsWith("yml")
            })?.toList() ?: emptyList()
            assert(yamlFiles.size == 1) { message("cloudformation.yaml.too_many_files", yamlFiles.size) }
            return LocalFileSystem.getInstance().refreshAndFindFileByIoFile(yamlFiles.first())
        }

        fun getCodeUrisFromTemplate(project: Project, template: VirtualFile): List<VirtualFile> {
            val cfTemplate = CloudFormationTemplate.parse(project, template)

            val codeUris = mutableListOf<VirtualFile>()
            val templatePath = Paths.get(template.parent.path)
            val localFileSystem = LocalFileSystem.getInstance()

            cfTemplate.resources().filter { it.isType(SERVERLESS_FUNCTION_TYPE) }.forEach { resource ->
                val codeUriValue = resource.getScalarProperty("CodeUri")
                val codeUriPath = templatePath.resolve(codeUriValue)
                localFileSystem.refreshAndFindFileByIoFile(codeUriPath.toFile())
                    ?.takeIf { it.isDirectory }
                    ?.let { codeUri ->
                        codeUris.add(codeUri)
                    }
            }
            return codeUris
        }

        fun setSourceRoots(projectRoot: VirtualFile, project: Project, modifiableModel: ModifiableRootModel) {
            val template = getTemplateFromDirectory(projectRoot) ?: return
            val codeUris = getCodeUrisFromTemplate(project, template)
            modifiableModel.contentEntries.forEach { contentEntry ->
                if (contentEntry.file == projectRoot) {
                    codeUris.forEach { contentEntry.addSourceFolder(it, false) }
                }
            }
        }

        fun excludeSamDirectory(projectRoot: VirtualFile, modifiableModel: ModifiableRootModel) {
            modifiableModel.contentEntries.forEach { contentEntry ->
                if (contentEntry.file == projectRoot) {
                    contentEntry.addExcludeFolder(
                        VfsUtilCore.pathToUrl(
                            Paths.get(
                                projectRoot.path,
                                SAM_BUILD_DIR
                            ).toString()
                        )
                    )
                }
            }
        }
    }
}
