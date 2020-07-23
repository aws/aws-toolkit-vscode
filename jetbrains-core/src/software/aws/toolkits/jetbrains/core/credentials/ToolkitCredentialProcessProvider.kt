// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.MapperFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.ProcessOutput
import com.intellij.execution.util.ExecUtil
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.util.registry.Registry
import com.intellij.util.execution.ParametersListUtil
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.utils.cache.CachedSupplier
import software.amazon.awssdk.utils.cache.RefreshResult
import software.aws.toolkits.resources.message
import java.time.Instant

class ToolkitCredentialProcessProvider internal constructor(
    private val command: String,
    private val parser: CredentialProcessOutputParser
) : AwsCredentialsProvider {
    constructor(command: String) : this(command, DefaultCredentialProcessOutputParser)

    private val entrypoint by lazy {
        ParametersListUtil.parse(command).first()
    }
    private val cmd by lazy {
        if (SystemInfo.isWindows) {
            GeneralCommandLine("cmd", "/C", command)
        } else {
            GeneralCommandLine("sh", "-c", command)
        }
    }
    private val processCredentialCache = CachedSupplier.builder { refresh() }.build()

    override fun resolveCredentials(): AwsCredentials = processCredentialCache.get()

    private fun refresh(): RefreshResult<AwsCredentials> {
        val timeout = Registry.intValue("aws.credentialProcess.timeout", DEFAULT_TIMEOUT)
        val output = ExecUtil.execAndGetOutput(cmd, timeout)

        if (output.isTimeout) {
            handleException(message("credentials.profile.credential_process.timeout_exception_prefix", entrypoint), output)
        }

        if (output.exitCode != 0) {
            handleException(message("credentials.profile.credential_process.execution_exception_prefix", entrypoint), output)
        }

        val result = try {
            parser.parse(output.stdout)
        } catch (e: Exception) {
            handleException(message("credentials.profile.credential_process.parse_exception_prefix"), output)
        }
        val credentials = when (val token = result.sessionToken) {
            null -> AwsBasicCredentials.create(result.accessKeyId, result.secretAccessKey)
            else -> AwsSessionCredentials.create(result.accessKeyId, result.secretAccessKey, token)
        }
        return RefreshResult.builder(credentials).staleTime(result.expiration ?: Instant.MAX).build()
    }

    private fun handleException(msgPrefix: String, process: ProcessOutput): Nothing {
        val errorOutput = process.stderr.takeIf { it.isNotBlank() }
        val msg = "$msgPrefix${errorOutput?.let { ": $it" } ?: ""}"
        throw RuntimeException(msg)
    }

    internal companion object {
        private const val DEFAULT_TIMEOUT = 30000
    }
}

internal data class CredentialProcessOutput(val accessKeyId: String, val secretAccessKey: String, val sessionToken: String?, val expiration: Instant?)

internal abstract class CredentialProcessOutputParser {
    abstract fun parse(input: String): CredentialProcessOutput
}

internal object DefaultCredentialProcessOutputParser : CredentialProcessOutputParser() {
    private val mapper = jacksonObjectMapper()
        .enable(MapperFeature.ACCEPT_CASE_INSENSITIVE_PROPERTIES)
        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .registerModule(JavaTimeModule())

    override fun parse(input: String): CredentialProcessOutput = try {
        mapper.readValue(input)
    } catch (e: JsonProcessingException) {
        e.clearLocation()
        throw e
    }
}
