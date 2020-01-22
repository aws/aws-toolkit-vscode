// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas

import com.fasterxml.jackson.annotation.JsonProperty
import software.amazon.awssdk.services.schemas.model.SchemaSummary
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.resources.message

enum class SchemaCodeLangs(
    val apiValue: String,
    val text: String,
    val extension: String,
    val runtimeGroup: RuntimeGroup
) {
    JAVA8("Java8", message("schemas.schema.SchemaCodeLangs.JAVA8"), "java", RuntimeGroup.JAVA),
    PYTHON3_6("Python36", message("schemas.schema.SchemaCodeLangs.PYTHON3_6"), "py", RuntimeGroup.PYTHON),
    TYPESCRIPT("TypeScript3", message("schemas.schema.SchemaCodeLangs.TYPESCRIPT"), "ts", RuntimeGroup.NODEJS);

    override fun toString() = text
}

data class Schema(val name: String, val registryName: String, val arn: String?)

data class SchemaSummary(val name: String, val registryName: String) {
    fun title(): String = name.split('.', '@').last()

    override fun toString() = "$registryName/$name"
}

data class SchemaTemplateParameters(
    val schema: software.aws.toolkits.jetbrains.services.schemas.SchemaSummary,
    val schemaVersion: String,
    val templateExtraContext: SchemaTemplateExtraContext
)

// This matches the extra_content parameters to Schema-based templates in both key and value names in cookiecutter.json in the templates used by
// SamEventBridgeStarterAppMaven and SamEventBridgeStarterAppGradle
data class SchemaTemplateExtraContext(

    // Name of schema registry
    @get:JsonProperty("AWS_Schema_registry")
    val schemaRegistry: String,

    // Name of schema root event object
    @get:JsonProperty("AWS_Schema_name")
    val schemaRootEventName: String,

    // Schema root - ie package hierarchy
    @get:JsonProperty("AWS_Schema_root")
    val schemaPackageHierarchy: String,

    // Source of schema on EventBridge bus
    @get:JsonProperty("AWS_Schema_source")
    val source: String,

    // Detail type of schema on EventBridge bus
    @get:JsonProperty("AWS_Schema_detail_type")
    val detailType: String,

    // Need to provide user agent to SAM CLI so that it will enable appTemplate-based
    @get:JsonProperty("user_agent")
    val userAgent: String = "AWSToolkit"
)

fun SchemaSummary.toDataClass(registryName: String) = Schema(
    name = this.schemaName(),
    arn = this.schemaArn(),
    registryName = registryName
)
