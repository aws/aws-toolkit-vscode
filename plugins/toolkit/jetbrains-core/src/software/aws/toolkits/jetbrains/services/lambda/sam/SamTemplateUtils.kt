// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.lambda.sam

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory
import com.fasterxml.jackson.module.kotlin.convertValue
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiElement
import com.intellij.testFramework.LightVirtualFile
import software.amazon.awssdk.services.lambda.model.Architecture
import software.amazon.awssdk.services.lambda.model.PackageType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.inputStream
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.core.utils.writeText
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationTemplate
import software.aws.toolkits.jetbrains.services.cloudformation.Function
import software.aws.toolkits.jetbrains.services.cloudformation.SERVERLESS_FUNCTION_TYPE
import software.aws.toolkits.jetbrains.services.lambda.LambdaLimits
import software.aws.toolkits.jetbrains.services.lambda.steps.UploadedCode
import software.aws.toolkits.jetbrains.services.lambda.steps.UploadedEcrCode
import software.aws.toolkits.jetbrains.services.lambda.steps.UploadedS3Code
import software.aws.toolkits.jetbrains.utils.YamlWriter
import software.aws.toolkits.jetbrains.utils.yaml
import software.aws.toolkits.resources.message
import java.io.File
import java.nio.file.Files
import java.nio.file.Path

object SamTemplateUtils {
    private val LOG = getLogger<SamTemplateUtils>()
    private val MAPPER = ObjectMapper(YAMLFactory())
    private const val S3_URI_PREFIX = "s3://"

    fun getFunctionEnvironmentVariables(template: Path, logicalId: String): Map<String, String> = readTemplate(template) {
        val function = requiredAt("/Resources").get(logicalId)
            ?: throw IllegalArgumentException("No resource with the logical ID $logicalId")
        val globals = at("/Globals/Function/Environment/Variables")
        val variables = function.at("/Properties/Environment/Variables")
        val globalVars = runCatching { MAPPER.convertValue<Map<String, String>?>(globals) ?: emptyMap() }.getOrDefault(emptyMap())
        val vars = runCatching { MAPPER.convertValue<Map<String, String>?>(variables) ?: emptyMap() }.getOrDefault(emptyMap())
        // function vars overwrite global ones if they overlap, so this works as expected
        globalVars + vars
    }

    fun getUploadedCodeUri(template: Path, logicalId: String): UploadedCode = readTemplate(template) {
        val function = findFunction(logicalId)
        if (function.isImageBased()) {
            UploadedEcrCode(function.requiredAt("/Properties/ImageUri").textValue())
        } else {
            val codeUri = function.requiredAt("/Properties/CodeUri")

            // CodeUri: s3://<bucket>>/<key>
            // or
            // CodeUri:
            //  Bucket: mybucket-name
            //  Key: code.zip
            //  Version: 121212

            when {
                codeUri.isTextual -> convertCodeUriString(codeUri.textValue())
                codeUri.isObject -> convertCodeUriObject(codeUri)
                else -> throw IllegalStateException("Unable to parse codeUri $codeUri")
            }
        }
    }

    private fun convertCodeUriString(codeUri: String): UploadedS3Code {
        if (!codeUri.startsWith(S3_URI_PREFIX)) {
            throw IllegalStateException("$codeUri does not start with $S3_URI_PREFIX")
        }

        val s3bucketKey = codeUri.removePrefix(S3_URI_PREFIX)
        val split = s3bucketKey.split("/", limit = 2)
        if (split.size != 2) {
            throw IllegalStateException("$codeUri does not follow the format $S3_URI_PREFIX<bucket>/<key>")
        }

        return UploadedS3Code(
            bucket = split.first(),
            key = split.last(),
            version = null
        )
    }

    private fun convertCodeUriObject(codeUri: JsonNode): UploadedS3Code = UploadedS3Code(
        bucket = codeUri.required("Bucket").textValue(),
        key = codeUri.required("Key").textValue(),
        version = codeUri.get("Version").textValue()
    )

    /**
     * Returns the location of the Lambda source code as per SAM build requirements
     */
    fun getCodeLocation(template: Path, logicalId: String): String = readTemplate(template) {
        val function = findFunction(logicalId)
        if (function.isServerlessFunction()) {
            if (function.isImageBased()) {
                function.getPathOrThrow(logicalId, "/Metadata/DockerContext").textValue()
            } else {
                function.getPathOrThrow(logicalId, "/Properties/CodeUri").textValue()
            }
        } else {
            function.getPathOrThrow(logicalId, "/Properties/Code").textValue()
        }
    }

    private fun JsonNode.getPathOrThrow(logicalId: String, path: String): JsonNode {
        val node = at(path)
        if (node.isMissingNode) {
            throw RuntimeException(message("cloudformation.key_not_found", path, logicalId))
        }
        return node
    }

    private fun JsonNode.findFunction(logicalId: String): JsonNode = this.requiredAt("/Resources").get(logicalId)
        ?: throw IllegalArgumentException("No resource with the logical ID $logicalId")

    private fun JsonNode.isImageBased(): Boolean = this.packageType() == PackageType.IMAGE

    private fun JsonNode.packageType(): PackageType {
        val type = this.at("/Properties/PackageType")?.textValue() ?: return PackageType.ZIP
        return PackageType.knownValues().firstOrNull { it.toString() == type }
            ?: throw IllegalStateException(message("cloudformation.invalid_property", "PackageType", type))
    }

    private fun JsonNode.isServerlessFunction(): Boolean = this.get("Type")?.textValue() == SERVERLESS_FUNCTION_TYPE

    private fun <T> readTemplate(template: Path, function: JsonNode.() -> T): T = template.inputStream().use {
        function(MAPPER.readTree(it))
    }

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
        architecture: Architecture? = Architecture.X86_64,
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
                mapping("Architectures") {
                    listValue(architecture.toString())
                }
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
            Files.createDirectories(tempFile.parent)
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
