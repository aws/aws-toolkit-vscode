// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.lambda.sam

import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiElement
import com.intellij.testFramework.LightVirtualFile
import software.amazon.awssdk.services.lambda.model.PackageType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.core.utils.writeText
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationTemplate
import software.aws.toolkits.jetbrains.services.cloudformation.Function
import software.aws.toolkits.jetbrains.services.cloudformation.SERVERLESS_FUNCTION_TYPE
import software.aws.toolkits.jetbrains.services.lambda.LambdaLimits
import software.aws.toolkits.jetbrains.utils.YamlWriter
import software.aws.toolkits.jetbrains.utils.yaml
import java.io.File
import java.nio.file.Files
import java.nio.file.Path

object SamTemplateUtils {
    private val LOG = getLogger<SamTemplateUtils>()

    @JvmStatic
    fun findFunctionsFromTemplate(project: Project, file: File): List<Function> {
        val virtualFile = file.readFileIntoMemory() ?: return emptyList()
        return findFunctionsFromTemplate(project, virtualFile)
    }

    @JvmStatic
    fun findFunctionsFromTemplate(project: Project, file: VirtualFile): List<Function> = try {
        ReadAction.compute<List<Function>, Throwable> {
            CloudFormationTemplate.parse(project, file).resources()
                .filterIsInstance<Function>()
                .toList()
        }
    } catch (e: Exception) {
        LOG.warn(e) { "Failed to parse template: $file" }
        emptyList()
    }

    fun findImageFunctionsFromTemplate(project: Project, file: File): List<Function> {
        val virtualFile = file.readFileIntoMemory() ?: return emptyList()
        return findImageFunctionsFromTemplate(project, virtualFile)
    }

    fun findImageFunctionsFromTemplate(project: Project, file: VirtualFile): List<Function> =
        findFunctionsFromTemplate(project, file).filter { it.packageType() == PackageType.IMAGE }

    @JvmStatic
    fun findZipFunctionsFromTemplate(project: Project, file: File): List<Function> {
        val virtualFile = file.readFileIntoMemory() ?: return emptyList()
        return findZipFunctionsFromTemplate(project, virtualFile)
    }

    @JvmStatic
    fun findZipFunctionsFromTemplate(project: Project, file: VirtualFile): List<Function> =
        findFunctionsFromTemplate(project, file).filter { it.packageType() == PackageType.ZIP }

    @JvmStatic
    fun functionFromElement(element: PsiElement): Function? = CloudFormationTemplate.convertPsiToResource(element) as? Function

    fun writeDummySamTemplate(
        tempFile: Path,
        logicalId: String,
        runtime: Runtime,
        codeUri: String,
        handler: String,
        timeout: Int = LambdaLimits.DEFAULT_TIMEOUT,
        memorySize: Int = LambdaLimits.DEFAULT_MEMORY_SIZE,
        envVars: Map<String, String> = emptyMap()
    ) {
        templateCommon(
            tempFile = tempFile,
            logicalId = logicalId,
            timeout = timeout,
            memorySize = memorySize,
            envVars = envVars,
            properties = {
                keyValue("Handler", handler)
                keyValue("CodeUri", codeUri)
                keyValue("Runtime", runtime.toString())
            }
        )
    }

    fun writeDummySamImageTemplate(
        tempFile: Path,
        logicalId: String,
        dockerfile: Path,
        timeout: Int = LambdaLimits.DEFAULT_TIMEOUT,
        memorySize: Int = LambdaLimits.DEFAULT_MEMORY_SIZE,
        envVars: Map<String, String> = emptyMap()
    ) {
        templateCommon(
            tempFile = tempFile,
            logicalId = logicalId,
            timeout = timeout,
            memorySize = memorySize,
            envVars = envVars,
            properties = {
                keyValue("PackageType", "Image")
            },
            metadata = {
                keyValue("DockerContext", dockerfile.parent.toString())
                keyValue("Dockerfile", dockerfile.fileName.toString())
            }
        )
    }

    private fun templateCommon(
        tempFile: Path,
        logicalId: String,
        timeout: Int = LambdaLimits.DEFAULT_TIMEOUT,
        memorySize: Int = LambdaLimits.DEFAULT_MEMORY_SIZE,
        envVars: Map<String, String> = emptyMap(),
        properties: YamlWriter.() -> Unit,
        metadata: (YamlWriter.() -> Unit)? = null
    ) {
        if (!tempFile.exists()) {
            Files.createFile(tempFile)
        }
        tempFile.writeText(
            yaml {
                mapping("Resources") {
                    mapping(logicalId) {
                        keyValue("Type", SERVERLESS_FUNCTION_TYPE)
                        mapping("Properties") {
                            keyValue("Timeout", timeout.toString())
                            keyValue("MemorySize", memorySize.toString())

                            properties(this)

                            if (envVars.isNotEmpty()) {
                                mapping("Environment") {
                                    mapping("Variables") {
                                        envVars.forEach { (key, value) ->
                                            keyValue(key, value)
                                        }
                                    }
                                }
                            }
                        }

                        metadata?.let {
                            mapping("Metadata") {
                                metadata.invoke(this)
                            }
                        }
                    }
                }
            }
        )
    }

    private fun File.readFileIntoMemory(): VirtualFile? {
        if (!isFile) {
            return null
        }

        // Use in-memory file since we can't refresh since we are most likely in a read action
        val templateContent = readText()
        return LightVirtualFile(name, templateContent)
    }
}
