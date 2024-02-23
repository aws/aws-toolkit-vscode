// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation

import software.amazon.awssdk.services.lambda.model.PackageType
import software.aws.toolkits.jetbrains.services.cloudformation.yaml.YamlCloudFormationTemplate.Companion.getTextValues
import software.aws.toolkits.resources.message

interface Function : Resource {
    fun codeLocation(): String
    fun setCodeLocation(location: String)
    fun packageType(): PackageType {
        val key = "PackageType"
        val type = getOptionalScalarProperty(key) ?: return PackageType.ZIP
        return PackageType.values().firstOrNull { it.toString() == type } ?: throw IllegalStateException(message("cloudformation.invalid_property", key, type))
    }

    fun runtime(): String = getScalarProperty("Runtime")
    fun handler(): String = getScalarProperty("Handler")
    fun architectures(): List<String>? = getOptionalSequenceProperty("Architectures")?.getTextValues()
    fun timeout(): Int? = getOptionalScalarProperty("Timeout")?.toInt()
    fun memorySize(): Int? = getOptionalScalarProperty("MemorySize")?.toInt()
}

const val LAMBDA_FUNCTION_TYPE = "AWS::Lambda::Function"

class LambdaFunction(private val delegate: Resource) : Resource by delegate, Function {
    override fun setCodeLocation(location: String) {
        setScalarProperty("Code", location)
    }

    override fun codeLocation(): String = getScalarProperty("Code")

    override fun toString(): String = logicalName
}

const val SERVERLESS_FUNCTION_TYPE = "AWS::Serverless::Function"

class SamFunction(private val delegate: Resource) : Resource by delegate, Function {
    private val globals = cloudFormationTemplate.globals()

    override fun getScalarProperty(key: String): String = getOptionalScalarProperty(key)
        ?: throw IllegalStateException(message("cloudformation.missing_property", key, logicalName))

    override fun getOptionalScalarProperty(key: String): String? =
        delegate.getOptionalScalarProperty(key) ?: globals["Function"]?.getOptionalScalarProperty(key)

    override fun setCodeLocation(location: String) {
        setScalarProperty("CodeUri", location)
    }

    override fun codeLocation(): String = when (packageType()) {
        PackageType.ZIP -> getScalarProperty("CodeUri")
        PackageType.IMAGE -> getScalarMetadata("DockerContext")
        else -> throw IllegalStateException("Bad packageType somehow returned to code location: ${packageType()}")
    }

    fun dockerFile(): String? = getOptionalScalarMetadata("Dockerfile")

    override fun toString(): String = logicalName
}

internal val RESOURCE_MAPPINGS = mapOf<String, (Resource) -> Resource>(
    LAMBDA_FUNCTION_TYPE to ::LambdaFunction,
    SERVERLESS_FUNCTION_TYPE to ::SamFunction
)
