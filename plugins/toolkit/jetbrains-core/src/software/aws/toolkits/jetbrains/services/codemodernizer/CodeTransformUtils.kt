// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.ProcessNotCreatedException
import com.intellij.execution.util.ExecUtil
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.module.ModuleUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.serviceContainer.AlreadyDisposedException
import org.jetbrains.idea.maven.project.MavenProjectsManager
import org.jetbrains.idea.maven.utils.MavenUtil
import org.jetbrains.plugins.gradle.settings.GradleSettings
import org.slf4j.LoggerFactory
import software.amazon.awssdk.awscore.exception.AwsServiceException
import software.amazon.awssdk.core.exception.SdkClientException
import software.amazon.awssdk.services.codewhispererruntime.model.CodeWhispererRuntimeException
import software.amazon.awssdk.services.codewhispererruntime.model.GetTransformationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.InternalServerException
import software.amazon.awssdk.services.codewhispererruntime.model.ThrottlingException
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationJob
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationLanguage
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationPlan
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationStatus
import software.amazon.awssdk.services.codewhispererruntime.model.ValidationException
import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.utils.WaiterUnrecoverableException
import software.aws.toolkits.core.utils.Waiters.waitUntil
import software.aws.toolkits.core.utils.createParentDirectories
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.QConnection
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProvider
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.ActiveConnection
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.ActiveConnectionType
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.BearerTokenFeatureSet
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.checkBearerConnectionValidity
import software.aws.toolkits.jetbrains.services.codemodernizer.client.GumbyClient
import software.aws.toolkits.jetbrains.services.codemodernizer.model.JobId
import software.aws.toolkits.jetbrains.services.codemodernizer.model.MAVEN_CONFIGURATION_FILE_NAME
import software.aws.toolkits.jetbrains.services.codemodernizer.state.CodeTransformTelemetryState
import software.aws.toolkits.telemetry.CodetransformTelemetry
import java.io.File
import java.io.FileOutputStream
import java.lang.Thread.sleep
import java.nio.file.Path
import java.time.Duration
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean
import java.util.zip.ZipFile
import kotlin.io.path.Path

val STATES_WHERE_PLAN_EXIST = setOf(
    TransformationStatus.PLANNED,
    TransformationStatus.TRANSFORMING,
    TransformationStatus.TRANSFORMED,
    TransformationStatus.PARTIALLY_COMPLETED,
    TransformationStatus.COMPLETED,
)

val STATES_AFTER_INITIAL_BUILD = setOf(
    TransformationStatus.PREPARED,
    TransformationStatus.PLANNING,
    *STATES_WHERE_PLAN_EXIST.toTypedArray()
)

val STATES_AFTER_STARTED = setOf(
    TransformationStatus.STARTED,
    TransformationStatus.PREPARING,
    *STATES_AFTER_INITIAL_BUILD.toTypedArray(),
)

val STATES_WHERE_JOB_STOPPED_PRE_PLAN_READY = setOf(
    TransformationStatus.FAILED,
    TransformationStatus.STOPPED,
    TransformationStatus.STOPPING,
    TransformationStatus.REJECTED,
    TransformationStatus.UNKNOWN_TO_SDK_VERSION,
)

val TERMINAL_STATES = setOf(
    TransformationStatus.FAILED,
    TransformationStatus.STOPPED,
    TransformationStatus.REJECTED,
    TransformationStatus.PARTIALLY_COMPLETED,
    TransformationStatus.COMPLETED,
)

private val LOG = LoggerFactory.getLogger("CodeTransformUtils")

fun String.toVirtualFile() = VirtualFileManager.getInstance().findFileByUrl(VfsUtilCore.pathToUrl(this))
fun Project.moduleFor(path: String) = ModuleUtil.findModuleForFile(
    path.toVirtualFile() ?: throw RuntimeException("File not found $path"),
    this,
)

/**
 * Unzips a zip into a dir. Returns the true when successfully unzips the file pointed to by [zipFilePath] to [destDir]
 */
fun unzipFile(zipFilePath: Path, destDir: Path): Boolean {
    if (!zipFilePath.exists()) return false
    val zipFile = ZipFile(zipFilePath.toFile())
    zipFile.use { file ->
        file.entries().asSequence()
            .filterNot { it.isDirectory }
            .map { zipEntry ->
                val destPath = destDir.resolve(zipEntry.name)
                destPath.createParentDirectories()
                FileOutputStream(destPath.toFile()).use { targetFile ->
                    zipFile.getInputStream(zipEntry).copyTo(targetFile)
                }
            }.toList()
    }
    return true
}

fun String.toTransformationLanguage() = when (this) {
    "JDK_1_8" -> TransformationLanguage.JAVA_8
    "JDK_11" -> TransformationLanguage.JAVA_11
    "JDK_17" -> TransformationLanguage.JAVA_17
    else -> TransformationLanguage.UNKNOWN_TO_SDK_VERSION
}

fun calculateTotalLatency(startTime: Instant, endTime: Instant) = (endTime.toEpochMilli() - startTime.toEpochMilli()).toInt()

data class PollingResult(
    val succeeded: Boolean,
    val jobDetails: TransformationJob?,
    val state: TransformationStatus,
    val transformationPlan: TransformationPlan?
)

fun refreshToken(project: Project) {
    val connection = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(QConnection.getInstance())
    val provider = (connection?.getConnectionSettings() as TokenConnectionSettings).tokenProvider.delegate as BearerTokenProvider
    provider.refresh()
}

/**
 * Wrapper around [waitUntil] that polls the API DescribeMigrationJob to check the migration job status.
 */
suspend fun JobId.pollTransformationStatusAndPlan(
    succeedOn: Set<TransformationStatus>,
    failOn: Set<TransformationStatus>,
    clientAdaptor: GumbyClient,
    initialSleepDurationMillis: Long,
    sleepDurationMillis: Long,
    isDisposed: AtomicBoolean,
    project: Project,
    maxDuration: Duration = Duration.ofSeconds(604800),
    onStateChange: (previousStatus: TransformationStatus?, currentStatus: TransformationStatus, transformationPlan: TransformationPlan?) -> Unit,
): PollingResult {
    var state = TransformationStatus.UNKNOWN_TO_SDK_VERSION
    var transformationResponse: GetTransformationResponse? = null
    var transformationPlan: TransformationPlan? = null
    var didSleepOnce = false
    val maxRefreshes = 10
    var numRefreshes = 0
    refreshToken(project)

    try {
        waitUntil(
            succeedOn = { state in succeedOn },
            failOn = { state in failOn },
            maxDuration = maxDuration,
            exceptionsToStopOn = setOf(
                InternalServerException::class,
                ValidationException::class,
                AccessDeniedException::class,
                AwsServiceException::class,
                SdkClientException::class,
                CodeWhispererRuntimeException::class,
                RuntimeException::class,
            ),
            exceptionsToIgnore = setOf(ThrottlingException::class)
        ) {
            try {
                if (!didSleepOnce) {
                    sleep(initialSleepDurationMillis)
                    didSleepOnce = true
                }
                if (isDisposed.get()) throw AlreadyDisposedException("The invoker is disposed.")
                transformationResponse = clientAdaptor.getCodeModernizationJob(this.id)
                val newStatus = transformationResponse?.transformationJob()?.status() ?: throw RuntimeException("Unable to get job status")
                var newPlan: TransformationPlan? = null
                if (newStatus in STATES_WHERE_PLAN_EXIST) {
                    sleep(sleepDurationMillis)
                    newPlan = clientAdaptor.getCodeModernizationPlan(this).transformationPlan()
                }
                if (newStatus != state) {
                    CodetransformTelemetry.jobStatusChanged(
                        codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                        codeTransformJobId = this.id,
                        codeTransformStatus = newStatus.toString()
                    )
                }
                if (newPlan != transformationPlan) {
                    CodetransformTelemetry.jobStatusChanged(
                        codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                        codeTransformJobId = this.id,
                        codeTransformStatus = "PLAN_UPDATED"
                    )
                }
                if (newStatus != state || newPlan != transformationPlan) {
                    transformationPlan = newPlan
                    onStateChange(state, newStatus, transformationPlan)
                }
                state = newStatus
                numRefreshes = 0
            } catch (e: AccessDeniedException) {
                if (numRefreshes++ > maxRefreshes) throw e
                refreshToken(project)
            } finally {
                sleep(sleepDurationMillis)
            }
        }
    } catch (e: WaiterUnrecoverableException) {
        return PollingResult(false, transformationResponse?.transformationJob(), state, transformationPlan)
    }
    return PollingResult(true, transformationResponse?.transformationJob(), state, transformationPlan)
}

fun filterOnlyParentFiles(filePaths: Set<VirtualFile>): List<VirtualFile> {
    if (filePaths.isEmpty()) return listOf()
    // sorts it like:
    // foo
    // foo/bar
    // foo/bar/bas
    val sorted = filePaths.sortedBy { Path(it.path).nameCount }
    val uniquePrefixes = mutableSetOf(Path(sorted.first().path).parent)
    val shortestRoots = mutableSetOf(sorted.first())
    shortestRoots.add(sorted.first())
    sorted.drop(1).forEach { file ->
        if (uniquePrefixes.none { Path(file.path).startsWith(it) }) {
            shortestRoots.add(file)
            uniquePrefixes.add(Path(file.path).parent)
        } else if (Path(file.path).parent in uniquePrefixes) {
            shortestRoots.add(file) // handles multiple parent files on the same level
        }
    }
    return shortestRoots.toList()
}

/**
 * @description For every directory, check if any supported build files (pom.xml etc) exists.
 * If we find a valid build file, store it and stop further recursion.
 */
fun findBuildFiles(sourceFolder: File, supportedBuildFileNames: List<String>): List<File> {
    val buildFiles = mutableListOf<File>()
    sourceFolder.walkTopDown()
        .maxDepth(5)
        .onEnter { currentDir ->
            supportedBuildFileNames.forEach {
                val maybeSupportedFile = currentDir.resolve(MAVEN_CONFIGURATION_FILE_NAME)
                if (maybeSupportedFile.exists()) {
                    buildFiles.add(maybeSupportedFile)
                    return@onEnter false
                }
            }
            return@onEnter true
        }.forEach {
            // noop, collects the sequence
        }
    return buildFiles
}

fun isIntellij(): Boolean {
    val productCode = ApplicationInfo.getInstance().build.productCode
    return productCode == "IC" || productCode == "IU"
}

fun isCodeModernizerAvailable(project: Project): Boolean {
    if (!isIntellij()) return false
    val connection = checkBearerConnectionValidity(project, BearerTokenFeatureSet.Q)
    return connection.connectionType == ActiveConnectionType.IAM_IDC && connection is ActiveConnection.ValidBearer
}

fun isGradleProject(project: Project) = !GradleSettings.getInstance(project).linkedProjectsSettings.isEmpty()

fun getJavaVersionFromProjectSetting(project: Project): String? = project.tryGetJdk()?.toString()

fun getMavenVersions(project: Project): String {
    fun getVersion(mavenCommand: String): String? {
        try {
            val commandLine = GeneralCommandLine(listOf(mavenCommand, "-v"))
                .withWorkDirectory(project.basePath)
                .withRedirectErrorStream(true)
            val output = ExecUtil.execAndGetOutput(commandLine)
            if (output.exitCode == 0) {
                return parseMavenVersion(output.stdout)
            } else {
                LOG.error { "Failed to fetch $mavenCommand version: ${output.stdout}" }
            }
        } catch (e: ProcessNotCreatedException) {
            LOG.warn { "$mavenCommand not set up" }
        } catch (e: Exception) {
            LOG.error(e) { "Failed to fetch $mavenCommand version" }
        }
        return null
    }

    // Get local maven version
    val localMavenVersion: String? = getVersion("mvn")

    // Get wrapper maven version
    val mvnw = if (SystemInfo.isWindows) "./mvnw.cmd" else "./mvnw"
    val wrapperMavenVersion: String? = getVersion(mvnw)

    // Get user's Maven setting (using bundled vs local vs wrapper)
    val mavenSettings = MavenProjectsManager.getInstance(project).getGeneralSettings()
    val mavenHome = mavenSettings.getMavenHome()
    // Need to detect bundled Maven version that come with IDEA
    // The utility returns "Use Maven wrapper" if using wrapper, "Bundled (Maven 3)" if using Bundled Maven, otherwise the local maven version.
    val userMavenSetting = MavenUtil.getMavenVersion(mavenHome) ?: mavenHome

    return "$wrapperMavenVersion (mvnw) -- $localMavenVersion (mvn) -- user setting: $userMavenSetting"
}

private fun parseMavenVersion(output: String?): String? {
    if (output == null) return null
    val mavenVersionIndex = output.indexOf("Apache Maven")
    if (mavenVersionIndex == -1) return null
    return try {
        val mavenVersionString = output.slice(IntRange(mavenVersionIndex + 13, output.length - 1))
        mavenVersionString.slice(IntRange(0, output.indexOf(' ') - 1))
    } catch (e: StringIndexOutOfBoundsException) {
        LOG.error(e) { "Failed to parse Maven version from output: $output" }
        null
    }
}
