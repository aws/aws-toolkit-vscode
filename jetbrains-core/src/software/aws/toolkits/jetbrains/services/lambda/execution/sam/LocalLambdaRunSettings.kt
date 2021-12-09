// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.PathMappingSettings.PathMapping
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.lambda.LambdaArchitecture
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions

interface TemplateSettings {
    val templateFile: VirtualFile
    val logicalId: String
}

interface ZipSettings {
    val runtime: LambdaRuntime
    val architecture: LambdaArchitecture
    val handler: String
}

interface ImageSettings {
    val imageDebugger: ImageDebugSupport
}

sealed class LocalLambdaRunSettings(
    val connection: ConnectionSettings,
    val samOptions: SamOptions,
    val environmentVariables: Map<String, String>,
    val debugHost: String,
    val input: String
) {
    abstract val runtimeGroup: RuntimeGroup
}

class TemplateRunSettings(
    override val templateFile: VirtualFile,
    override val runtime: LambdaRuntime,
    override val architecture: LambdaArchitecture,
    override val handler: String,
    override val logicalId: String,
    environmentVariables: Map<String, String>,
    connection: ConnectionSettings,
    samOptions: SamOptions,
    debugHost: String,
    input: String
) : TemplateSettings, ZipSettings, LocalLambdaRunSettings(connection, samOptions, environmentVariables, debugHost, input) {
    override val runtimeGroup = runtime.runtimeGroup ?: throw IllegalStateException("Attempting to run SAM for unsupported runtime $runtime")
}

class HandlerRunSettings(
    override val runtime: LambdaRuntime,
    override val architecture: LambdaArchitecture,
    override val handler: String,
    val timeout: Int,
    val memorySize: Int,
    environmentVariables: Map<String, String>,
    connection: ConnectionSettings,
    samOptions: SamOptions,
    debugHost: String,
    input: String
) : ZipSettings, LocalLambdaRunSettings(connection, samOptions, environmentVariables, debugHost, input) {
    override val runtimeGroup = runtime.runtimeGroup ?: throw IllegalStateException("Attempting to run SAM for unsupported runtime $runtime")
}

class ImageTemplateRunSettings(
    override val templateFile: VirtualFile,
    override val imageDebugger: ImageDebugSupport,
    override val logicalId: String,
    val dockerFile: VirtualFile,
    val pathMappings: List<PathMapping>,
    environmentVariables: Map<String, String>,
    connection: ConnectionSettings,
    samOptions: SamOptions,
    debugHost: String,
    input: String
) : ImageSettings, TemplateSettings, LocalLambdaRunSettings(connection, samOptions, environmentVariables, debugHost, input) {
    override val runtimeGroup = RuntimeGroup.find { imageDebugger.languageId in it.languageIds }
        ?: throw IllegalStateException("Attempting to run SAM for unsupported language ${imageDebugger.languageId}")
}

fun LocalLambdaRunSettings.resolveDebuggerSupport() = when (this) {
    is ImageTemplateRunSettings -> imageDebugger
    is ZipSettings -> RuntimeDebugSupport.getInstance(runtimeGroup)
    else -> throw IllegalStateException("Can't find debugger support for $this")
}
