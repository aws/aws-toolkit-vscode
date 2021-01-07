// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.PathMappingSettings.PathMapping
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettings
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions

interface TemplateBasedSettings {
    val templateFile: VirtualFile
    val logicalId: String
}

sealed class LocalLambdaRunSettings(
    val connection: ConnectionSettings,
    val samOptions: SamOptions,
    val environmentVariables: Map<String, String>,
    val runtime: Runtime,
    val debugHost: String,
    val input: String
) {
    val runtimeGroup = runtime.runtimeGroup ?: throw IllegalStateException("Attempting to run SAM for unsupported runtime $runtime")
}

class TemplateRunSettings(
    override val templateFile: VirtualFile,
    runtime: Runtime,
    val handler: String,
    override val logicalId: String,
    environmentVariables: Map<String, String>,
    connection: ConnectionSettings,
    samOptions: SamOptions,
    debugHost: String,
    input: String
) : TemplateBasedSettings, LocalLambdaRunSettings(connection, samOptions, environmentVariables, runtime, debugHost, input)

class HandlerRunSettings(
    runtime: Runtime,
    val handler: String,
    val timeout: Int,
    val memorySize: Int,
    environmentVariables: Map<String, String>,
    connection: ConnectionSettings,
    samOptions: SamOptions,
    debugHost: String,
    input: String
) : LocalLambdaRunSettings(connection, samOptions, environmentVariables, runtime, debugHost, input)

class ImageTemplateRunSettings(
    override val templateFile: VirtualFile,
    runtime: Runtime,
    override val logicalId: String,
    val dockerFile: VirtualFile,
    val pathMappings: List<PathMapping>,
    environmentVariables: Map<String, String>,
    connection: ConnectionSettings,
    samOptions: SamOptions,
    debugHost: String,
    input: String
) : TemplateBasedSettings, LocalLambdaRunSettings(connection, samOptions, environmentVariables, runtime, debugHost, input)
