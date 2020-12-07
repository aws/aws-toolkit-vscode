// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload.steps

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory
import com.intellij.execution.configurations.GeneralCommandLine
import software.aws.toolkits.core.utils.AttributeBagKey
import software.aws.toolkits.core.utils.inputStream
import software.aws.toolkits.jetbrains.services.lambda.sam.samPackageCommand
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.MessageEmitter
import software.aws.toolkits.resources.message
import java.nio.file.Path

class PackageLambda(
    private val templatePath: Path,
    private val packagedTemplatePath: Path,
    private val logicalId: String?,
    private val envVars: Map<String, String>,
    private val s3Bucket: String? = null,
    private val ecrRepo: String? = null
) : SamCliStep() {
    override val stepName: String = message("lambda.create.step.package")

    override fun constructCommandLine(context: Context): GeneralCommandLine = getCli().samPackageCommand(
        templatePath = templatePath,
        packagedTemplatePath = packagedTemplatePath,
        environmentVariables = envVars,
        s3Bucket = s3Bucket,
        ecrRepo = ecrRepo
    )

    override fun handleSuccessResult(output: String, messageEmitter: MessageEmitter, context: Context) {
        // We finished the upload, extract out the uploaded code location if we have a logicalId
        logicalId ?: return

        val mapper = ObjectMapper(YAMLFactory())
        val packagedYaml = packagedTemplatePath.inputStream().use { mapper.readTree(it) }
        val uploadedCodeLocation = if (isImageBased()) {
            UploadedEcrCode(packagedYaml.requiredAt("/Resources/$logicalId/Properties/ImageUri").textValue())
        } else {
            // CodeUri: s3://<bucket>>/<key>
            // or
            // CodeUri:
            //  Bucket: mybucket-name
            //  Key: code.zip
            //  Version: 121212

            val codeUri = packagedYaml.requiredAt("/Resources/$logicalId/Properties/CodeUri")

            when {
                codeUri.isTextual -> convertCodeUriString(codeUri.textValue())
                codeUri.isObject -> convertCodeUriObject(codeUri)
                else -> throw IllegalStateException("Unable to parse codeUri $codeUri")
            }
        }

        context.putAttribute(UPLOADED_CODE_LOCATION, uploadedCodeLocation)
    }

    private fun isImageBased() = ecrRepo != null

    private fun convertCodeUriString(codeUri: String): UploadedCode {
        if (!codeUri.startsWith(S3_PREFIX)) {
            throw IllegalStateException("$codeUri does not start with $S3_PREFIX")
        }

        val s3bucketKey = codeUri.removePrefix(S3_PREFIX)
        val split = s3bucketKey.split("/", limit = 2)
        if (split.size != 2) {
            throw IllegalStateException("$codeUri does not follow the format $S3_PREFIX<bucket>/<key>")
        }

        return UploadedS3Code(
            bucket = split.first(),
            key = split.last(),
            version = null
        )
    }

    private fun convertCodeUriObject(codeUri: JsonNode): UploadedCode = UploadedS3Code(
        bucket = codeUri.required("Bucket").textValue(),
        key = codeUri.required("Key").textValue(),
        version = codeUri.get("Version").textValue()
    )

    companion object {
        private const val S3_PREFIX = "s3://"
        val UPLOADED_CODE_LOCATION = AttributeBagKey.create<UploadedCode>("UPLOADED_CODE_LOCATION")
    }
}
