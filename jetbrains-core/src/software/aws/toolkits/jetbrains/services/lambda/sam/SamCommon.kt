// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.sam

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ModifiableRootModel
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.EnvironmentUtil
import com.intellij.util.text.SemVer
import com.intellij.util.text.nullize
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationTemplate
import software.aws.toolkits.jetbrains.services.cloudformation.SERVERLESS_FUNCTION_TYPE
import software.aws.toolkits.jetbrains.settings.SamSettings
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

        // Inclusive
        val expectedSamMinVersion = SemVer("0.32.0", 0, 32, 0)

        // Exclusive
        val expectedSamMaxVersion = SemVer("0.40.0", 0, 40, 0)

        val samInitSchemasSupportMinVersion = SemVer("0.35.0", 0, 35, 0)

        fun getSamCommandLine(path: String? = SamSettings.getInstance().executablePath): GeneralCommandLine {
            val sanitizedPath = path.nullize(true)
                ?: throw RuntimeException(message("sam.cli_not_configured"))

            // we have some env-hacks that we want to do, so we're building our own environment using the same util as GeneralCommandLine
            // GeneralCommandLine will apply some more env patches prior to process launch (see startProcess()) so this should be fine
            val effectiveEnvironment = EnvironmentUtil.getEnvironmentMap().toMutableMap()
            // apply hacks
            effectiveEnvironment.apply {
                // GitHub issue: https://github.com/aws/aws-toolkit-jetbrains/issues/645
                // strip out any AWS credentials in the parent environment
                remove("AWS_ACCESS_KEY_ID")
                remove("AWS_SECRET_ACCESS_KEY")
                remove("AWS_SESSION_TOKEN")
                // GitHub issue: https://github.com/aws/aws-toolkit-jetbrains/issues/577
                // coerce the locale to UTF-8 as specified in PEP 538
                // this is needed for Python 3.0 up to Python 3.7.0 (inclusive)
                // we can remove this once our IDE minimum version has a fix for https://youtrack.jetbrains.com/issue/PY-30780
                // currently only seeing this on OS X, so only scoping to that
                if (SystemInfo.isMac) {
                    // on other platforms this could be C.UTF-8 or C.UTF8
                    this["LC_CTYPE"] = "UTF-8"
                    // we're not setting PYTHONIOENCODING because we might break SAM on py2.7
                }
            }

            return GeneralCommandLine(sanitizedPath)
                .withParentEnvironmentType(GeneralCommandLine.ParentEnvironmentType.NONE)
                .withEnvironment(effectiveEnvironment)
        }

        /**
         * Check SAM CLI version and return an invalid message if version is not valid or <code>null</code> otherwise
         */
        fun getInvalidVersionMessage(semVer: SemVer): String? {
            val samVersionOutOfRangeMessage = message("executableCommon.version_wrong",
                SAM_NAME,
                expectedSamMinVersion,
                expectedSamMaxVersion, semVer)
            if (semVer >= expectedSamMaxVersion) {
                return "$samVersionOutOfRangeMessage ${message("executableCommon.version_too_high")}"
            } else if (semVer < expectedSamMinVersion) {
                return "$samVersionOutOfRangeMessage ${message("executableCommon.version_too_low", SAM_NAME)}"
            }
            return null
        }

        /**
         * Check SAM CLI version for Schemas support and return an invalid message if version does not support schemas or <code>null</code> otherwise
         */
        fun getInvalidSchemaSupportVersionMessage(semVer: SemVer): String? {
            val samVersionOutOfRangeMessage = message("sam.executable.schema_support_version_wrong",
                samInitSchemasSupportMinVersion,
                semVer)
            if (semVer < samInitSchemasSupportMinVersion) {
                return "$samVersionOutOfRangeMessage ${message("sam.executable.version_too_low")}"
            }
            return null
        }

        /**
         * @return The error message to display, else null if it is valid
         */
        @JvmOverloads
        fun validate(path: String? = SamSettings.getInstance().executablePath): String? {
            val sanitizedPath = path.nullize(true)
                ?: return message("sam.cli_not_configured")

            return try {
                getInvalidVersionMessage(
                    SamVersionCache.evaluateBlocking(
                        sanitizedPath,
                        SamVersionCache.DEFAULT_TIMEOUT_MS
                    ).result
                )
            } catch (e: Exception) {
                return e.message
            }
        }

        /**
         * @return The error message to display, else null if it is valid
         */
        @JvmOverloads
        fun validateSchemasSupport(path: String? = SamSettings.getInstance().executablePath): String? {
            val sanitizedPath = path.nullize(true)
                ?: return message("sam.cli_not_configured")

            return try {
                getInvalidSchemaSupportVersionMessage(
                    SamVersionCache.evaluateBlocking(
                        sanitizedPath
                    ).result
                )
            } catch (e: Exception) {
                return e.message
            }
        }

        /**
         * @return The string representation of the SAM version else "UNKNOWN"
         */
        fun getVersionString(path: String? = SamSettings.getInstance().executablePath): String {
            val sanitizedPath = path.nullize(true)
                ?: return "UNKNOWN"

            return try {
                SamVersionCache.evaluateBlocking(sanitizedPath, SamVersionCache.DEFAULT_TIMEOUT_MS).result.rawVersion
            } catch (e: Exception) {
                logger.error(e) { "Error while getting SAM executable version." }
                return "UNKNOWN"
            }
        }

        fun getTemplateFromDirectory(projectRoot: VirtualFile): VirtualFile? {
            // Use Java File so we don't need to do a full VFS refresh
            val projectRootFile = VfsUtil.virtualToIoFile(projectRoot)
            val yamlFiles = projectRootFile.listFiles(FileFilter {
                it.isFile && it.name.endsWith("yaml") || it.name.endsWith("yml")
            })
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
                    contentEntry.addExcludeFolder(VfsUtilCore.pathToUrl(Paths.get(projectRoot.path,
                        SAM_BUILD_DIR
                    ).toString()))
                }
            }
        }
    }
}
