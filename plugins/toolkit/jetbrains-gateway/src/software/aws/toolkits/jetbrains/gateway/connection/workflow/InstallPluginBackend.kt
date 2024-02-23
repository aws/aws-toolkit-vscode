// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection.workflow

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.ide.plugins.PluginManager
import com.intellij.openapi.util.text.StringUtil
import com.intellij.util.io.Compressor
import com.intellij.util.io.DigestUtil
import com.intellij.util.io.HttpRequests
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.presigner.S3Presigner
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.gateway.GatewayProduct
import software.aws.toolkits.jetbrains.gateway.ToolkitInstallSettings
import software.aws.toolkits.jetbrains.gateway.connection.AbstractSsmCommandExecutor
import software.aws.toolkits.jetbrains.gateway.connection.GET_IDE_BACKEND_VERSION_COMMAND
import software.aws.toolkits.jetbrains.utils.execution.steps.CliBasedStep
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.Step
import software.aws.toolkits.jetbrains.utils.execution.steps.StepWorkflow
import software.aws.toolkits.resources.message
import java.io.File
import java.nio.file.Path
import java.time.Duration
import java.util.UUID

abstract class InstallPluginBackend(
    protected val commandExecutor: AbstractSsmCommandExecutor,
    protected val remoteScriptPath: String,
    protected val idePath: String
) : CliBasedStep() {
    override val stepName: String = message("gateway.connection.workflow.install_toolkit")

    override fun constructCommandLine(context: Context): GeneralCommandLine? {
        val url = buildDownloadUrl() ?: return null
        val cmd = """$remoteScriptPath/install-plugin.sh "${idePath.trimEnd('/')}" "$url""""
        return commandExecutor.buildSshCommand {
            it.addToRemoteCommand(cmd)
        }
    }

    protected abstract fun buildDownloadUrl(): String?

    class InstallMarketplacePluginBackend(
        private val ideProduct: GatewayProduct?,
        commandExecutor: AbstractSsmCommandExecutor,
        remoteScriptPath: String,
        idePath: String,
        private val marketplaceUrl: String = "https://plugins.jetbrains.com"
    ) : InstallPluginBackend(commandExecutor, remoteScriptPath, idePath) {
        override fun buildDownloadUrl(): String? {
            val baseUrl = "$marketplaceUrl/pluginManager?action=download&id=aws.toolkit&build="

            if (ideProduct != null) {
                val url = "$baseUrl${ideProduct.productCode}-${ideProduct.buildNumber}"
                val responseCode = HttpRequests.head(url).throwStatusCodeException(false).tryConnect()
                return if (responseCode in 200..299) {
                    url
                } else {
                    null
                }
            }

            return "$baseUrl$($GET_IDE_BACKEND_VERSION_COMMAND)"
        }
    }

    class InstallLocalPluginBackend(
        private val installSettings: ToolkitInstallSettings.UseArbitraryLocalPath,
        commandExecutor: AbstractSsmCommandExecutor,
        remoteScriptPath: String,
        idePath: String
    ) : InstallPluginBackend(commandExecutor, remoteScriptPath, idePath) {
        override fun buildDownloadUrl(): String? {
            val credId = CredentialManager.getInstance().getCredentialIdentifierById("profile:default") ?: error("Default profile not available")
            val region = AwsRegionProvider.getInstance().defaultRegion()
            val connectionSettings = ConnectionSettings(CredentialManager.getInstance().getAwsCredentialProvider(credId, region), region)
            val toolkitPath = Path.of(installSettings.localToolkitPath)
            if (!toolkitPath.exists()) {
                return null
            }

            val messageDigest = DigestUtil.md5()
            DigestUtil.updateContentHash(messageDigest, toolkitPath)
            val toolkitHash = StringUtil.toHexString(messageDigest.digest())

            val s3Client = connectionSettings.awsClient<S3Client>()
            val s3StagingBucket = installSettings.s3StagingBucket
            val s3Key = toolkitPath.fileName.toString()

            try {
                // Will throw if the ETag doesn't match, so it will re-upload
                s3Client.headObject {
                    it.bucket(s3StagingBucket)
                    it.key(s3Key)
                    it.ifMatch(toolkitHash)
                }
            } catch (e: Exception) {
                s3Client.putObject(
                    {
                        it.bucket(s3StagingBucket)
                        it.key(s3Key)
                    },
                    toolkitPath
                )
            }

            val s3Presigner = S3Presigner.builder().credentialsProvider(connectionSettings.credentials).region(Region.of(connectionSettings.region.id)).build()
            val presignGetObject = s3Presigner.presignGetObject {
                it.signatureDuration(Duration.ofMinutes(10))
                it.getObjectRequest { req ->
                    req.bucket(s3StagingBucket)
                    req.key(s3Key)
                }
            }

            return presignGetObject.url().toString()
        }
    }
}

fun installBundledPluginBackend(
    commandExecutor: AbstractSsmCommandExecutor,
    remoteScriptPath: String,
    idePath: String
): Step {
    val remotePluginPath = "/tmp/${UUID.randomUUID()}.zip"

    return object : StepWorkflow(
        ZipAndCopyBundledPlugin(remotePluginPath, commandExecutor),
        InstallBundledPluginBackend(remotePluginPath, commandExecutor, remoteScriptPath, idePath)
    ) {
        override val stepName = "Install pre-GA development build (this will take a while)"
    }
}

private class ZipAndCopyBundledPlugin(
    private val remotePluginPath: String,
    private val commandExecutor: AbstractSsmCommandExecutor
) : CliBasedStep() {
    override val stepName: String = "Zip and copy bundled plugin"
    override fun constructCommandLine(context: Context): GeneralCommandLine? {
        val pluginPath = PluginManager.getPluginByClass(InstallBundledPluginBackend::class.java)?.pluginPath
            ?: throw RuntimeException("Could not determine AWS Toolkit plugin path")
        val zipPath = File.createTempFile("toolkit", "zip")
        val zip = Compressor.Zip(zipPath)
        zip.use {
            it.addDirectory(pluginPath.fileName.toString(), pluginPath)
        }

        return commandExecutor.buildScpCommand(remotePluginPath, false, zipPath.toPath())
    }
}

private class InstallBundledPluginBackend(
    private val remotePluginPath: String,
    commandExecutor: AbstractSsmCommandExecutor,
    remoteScriptPath: String,
    idePath: String
) : InstallPluginBackend(commandExecutor, remoteScriptPath, idePath) {
    override fun buildDownloadUrl(): String? = "file://$remotePluginPath"
}
