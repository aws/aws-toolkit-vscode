// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.util.io.FileUtil
import software.aws.toolkits.jetbrains.core.utils.buildList
import java.util.UUID

interface ImageDebugSupport : SamDebugSupport {
    val id: String

    /**
     * The primary language id, used to find the correct builder for the runtime
     */
    val languageId: String

    fun displayName(): String
    fun supportsPathMappings(): Boolean = false

    override fun samArguments(debugPorts: List<Int>): List<String> = buildList {
        val containerEnvVars = containerEnvVars(debugPorts)
        if (containerEnvVars.isNotEmpty()) {
            val path = createContainerEnvVarsFile(containerEnvVars)
            add("--container-env-vars")
            add(path)
        }
    }

    /**
     * Environment variables added to the execution of the container. These are used for debugging support for OCI
     * runtimes. The SAM CLI sets these for Zip based functions, but not Image based functions. An easy starting point
     * for the arguments is the list SAM cli maintains for Zip functions:
     * https://github.com/aws/aws-sam-cli/blob/develop/samcli/local/docker/lambda_debug_settings.py
     * @param debugPorts The list of debugger ports. Some runtimes (dotnet) require more than one
     */
    fun containerEnvVars(debugPorts: List<Int>): Map<String, String> = emptyMap()

    private fun createContainerEnvVarsFile(envVars: Map<String, String>): String {
        val envVarsFile = FileUtil.createTempFile("${UUID.randomUUID()}-debugArgs", ".json", true)
        envVarsFile.writeText(mapper.writeValueAsString(envVars))
        return envVarsFile.absolutePath
    }

    companion object {
        private val mapper = jacksonObjectMapper()
        val EP_NAME = ExtensionPointName<ImageDebugSupport>("aws.toolkit.lambda.sam.imageDebuggerSupport")

        fun debuggers(): Map<String, ImageDebugSupport> = EP_NAME.extensionList.associateBy { it.id }
    }
}
