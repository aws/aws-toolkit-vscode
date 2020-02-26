// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import com.fasterxml.jackson.databind.ObjectMapper
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.getExecutable
import software.aws.toolkits.jetbrains.services.lambda.TemplateParameters
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.jetbrains.services.schemas.SchemaTemplateParameters
import software.aws.toolkits.resources.message

object SamInitRunner {
    private val LOG = getLogger<SamInitRunner>()
    private val mapper = ObjectMapper()

    fun execute(
        name: String,
        outputDir: VirtualFile,
        runtime: Runtime,
        templateParameters: TemplateParameters,
        schemaParameters: SchemaTemplateParameters?
    ) {
        // set output to a temp dir
        val tempDir = createTempDir()

        ExecutableManager.getInstance().getExecutable<SamExecutable>().thenApply {
            val samExecutable = when (it) {
                is ExecutableInstance.Executable -> it
                else -> throw RuntimeException((it as? ExecutableInstance.BadExecutable)?.validationError)
            }
            val commandLine = samExecutable
                .getCommandLine()
                .withParameters("init")
                .withParameters("--no-input")
                .withParameters("--output-dir")
                .withParameters(tempDir.path)
                .withParameters("--no-interactive")
                .apply {
                    when (templateParameters) {
                        is TemplateParameters.AppBasedTemplate -> {
                            this.withParameters("--name")
                                .withParameters(name)
                                .withParameters("--runtime")
                                .withParameters(runtime.toString())
                                .withParameters("--dependency-manager")
                                .withParameters(templateParameters.dependencyManager)
                                .withParameters("--app-template")
                                .withParameters(templateParameters.appTemplate)
                        }
                        is TemplateParameters.LocationBasedTemplate -> {
                            this.withParameters("--location")
                                .withParameters(templateParameters.location)
                        }
                    }

                    schemaParameters?.let { params ->
                        val extraContextAsJson = mapper.writeValueAsString(params.templateExtraContext)

                        this.withParameters("--extra-context")
                            .withParameters(extraContextAsJson)
                    }
                }

            LOG.info { "Running SAM command ${commandLine.commandLineString}" }

            val process = CapturingProcessHandler(commandLine).runProcess()
            if (process.exitCode != 0) {
                throw RuntimeException("${message("sam.init.execution_error")}: ${process.stderrLines}")
            } else {
                LOG.info { "SAM init output stdout:\n${process.stdout}" }
                LOG.info { "SAM init output stderr:\n${process.stderr}" }
            }

            val subFolders = tempDir.listFiles()?.toList() ?: emptyList()

            assert(subFolders.size == 1 && subFolders.first().isDirectory) {
                message("sam.init.error.subfolder_not_one", tempDir.name)
            }

            FileUtil.copyDirContent(subFolders.first(), VfsUtil.virtualToIoFile(outputDir))
            FileUtil.delete(tempDir)
        }.toCompletableFuture().join()
    }
}
