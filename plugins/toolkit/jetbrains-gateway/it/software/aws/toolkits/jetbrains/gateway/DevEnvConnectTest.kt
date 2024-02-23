// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.util.ExecUtil
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.components.serviceOrNull
import com.intellij.openapi.util.Disposer
import com.intellij.remoteDev.downloader.JetBrainsClientDownloaderConfigurationProvider
import com.intellij.remoteDev.downloader.TestJetBrainsClientDownloaderConfigurationProvider
import com.intellij.remoteDev.hostStatus.UnattendedHostStatus
import com.intellij.testFramework.ApplicationExtension
import com.intellij.testFramework.registerOrReplaceServiceInstance
import com.intellij.util.io.HttpRequests
import com.intellij.util.net.NetUtils
import com.jetbrains.gateway.api.ConnectionRequestor
import com.jetbrains.gateway.api.GatewayConnectionHandle
import com.jetbrains.rd.util.lifetime.isNotAlive
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import org.junit.jupiter.api.Timeout
import org.junit.jupiter.api.condition.DisabledIfEnvironmentVariable
import org.junit.jupiter.api.condition.DisabledIfSystemProperty
import org.junit.jupiter.api.extension.AfterAllCallback
import org.junit.jupiter.api.extension.ExtendWith
import org.junit.jupiter.api.extension.ExtensionContext
import org.junit.jupiter.api.extension.RegisterExtension
import org.junit.jupiter.api.io.TempDir
import software.amazon.awssdk.services.codecatalyst.CodeCatalystClient
import software.amazon.awssdk.services.codecatalyst.model.ConflictException
import software.amazon.awssdk.services.codecatalyst.model.DevEnvironmentStatus
import software.amazon.awssdk.services.codecatalyst.model.InstanceType
import software.aws.toolkits.core.utils.Waiters.waitUntil
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.MockClientManager
import software.aws.toolkits.jetbrains.core.credentials.LegacyManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeCatalystConnection
import software.aws.toolkits.jetbrains.core.credentials.pinning.ConnectionPinningManager
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_REGION
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProvider
import software.aws.toolkits.jetbrains.core.tools.MockToolManagerRule
import software.aws.toolkits.jetbrains.core.tools.ToolManager
import software.aws.toolkits.jetbrains.gateway.connection.IDE_BACKEND_DIR
import software.aws.toolkits.jetbrains.gateway.connection.StdOutResult
import software.aws.toolkits.jetbrains.gateway.connection.ThinClientTrackerService
import software.aws.toolkits.jetbrains.gateway.connection.caws.CawsCommandExecutor
import software.aws.toolkits.jetbrains.gateway.connection.resultFromStdOut
import software.aws.toolkits.jetbrains.services.caws.isSubscriptionFreeTier
import software.aws.toolkits.jetbrains.services.ssm.SsmPlugin
import software.aws.toolkits.jetbrains.utils.FrameworkTestUtils
import software.aws.toolkits.jetbrains.utils.extensions.DevEnvironmentExtension
import software.aws.toolkits.jetbrains.utils.extensions.DisposerAfterAllExtension
import software.aws.toolkits.jetbrains.utils.extensions.SsoLogin
import java.nio.file.Path
import java.time.Duration
import java.util.concurrent.TimeUnit
import kotlin.reflect.KFunction
import kotlin.time.ExperimentalTime

@OptIn(ExperimentalTime::class)
@ExtendWith(ApplicationExtension::class)
@SsoLogin("codecatalyst-test-account")
@DisabledIfEnvironmentVariable(named = "IS_PROD", matches = "false")
@DisabledIfSystemProperty(named = "org.gradle.project.ideProfileName", matches = "2023.3", disabledReason = "Flakes on 233")
class DevEnvConnectTest : AfterAllCallback {
    companion object {
        @JvmField
        @RegisterExtension
        val disposableExtension = DisposerAfterAllExtension()

        private lateinit var connection: ManagedBearerSsoConnection

        @JvmField
        @RegisterExtension
        val environmentExtension = DevEnvironmentExtension({ connection }) { client, builder ->
            val space = client.listSpacesPaginator {}.items().map { it.name() }.let { spaces ->
                spaces.firstOrNull { it == "aws-toolkit-jetbrains-test-space" }
                    ?: spaces.firstOrNull { space ->
                        !isSubscriptionFreeTier(client, space)
                    }
            } ?: error("CodeCatalyst user doesn't have access to a paid space")

            val projectName = "aws-jetbrains-toolkit-integ-test-project"
            val project = try {
                client.createProject {
                    it.spaceName(space)
                    it.displayName(projectName)
                    it.description("Project used by AWS Toolkit Jetbrains integration tests")
                }.name()
            } catch (e: ConflictException) {
                client.getProject {
                    it.spaceName(space)
                    it.name(projectName)
                }.name()
            }

            builder.spaceName(space)
            builder.projectName(project)
            builder.ides({ ide ->
                ide.name("IntelliJ")
                ide.runtime("public.ecr.aws/jetbrains/iu:release")
            })
            builder.persistentStorage { storage ->
                storage.sizeInGiB(16)
            }
            builder.instanceType(InstanceType.DEV_STANDARD1_MEDIUM)
            builder.inactivityTimeoutMinutes(15)
            builder.repositories(emptyList())
        }
    }

    private val client: CodeCatalystClient by lazy {
        AwsClientManager.getInstance().getClient(connection.getConnectionSettings())
    }

    private val environment by lazy {
        environmentExtension.environment
    }

    private val ssmFactory by lazy {
        CawsCommandExecutor(
            client,
            environment.id,
            environment.spaceName,
            environment.projectName
        )
    }

    private val hostToken = System.getenv("CWM_HOST_STATUS_OVER_HTTP_TOKEN")

    private val localPort by lazy {
        NetUtils.findAvailableSocketPort()
    }

    private val lazyPortForward = lazy {
        ssmFactory.portForward(localPort, 63342)
    }

    private val endpoint by lazy {
        "http://localhost:$localPort/codeWithMe/unattendedHostStatus?token=$hostToken"
    }

    @BeforeEach
    fun setUp(@TempDir tempDir: Path) {
        FrameworkTestUtils.ensureBuiltInServerStarted()

        val disposable = disposableExtension.disposable
        serviceOrNull<ThinClientTrackerService>()
            ?: ApplicationManager
                .getApplication()
                .registerOrReplaceServiceInstance(ThinClientTrackerService::class.java, ThinClientTrackerService(), disposableExtension.disposable)

        MockClientManager.useRealImplementations(disposableExtension.disposable)
        MockToolManagerRule.useRealTools(disposable)

        // TODO: some sort of race happening where this somehow returns before the executable is usable?
        println(
            ExecUtil.execAndGetOutput(
                GeneralCommandLine(ToolManager.getInstance().getOrInstallTool(SsmPlugin).path.toAbsolutePath().toString())
            )
        )

        // can probably abstract this out as an extension
        // force auth to complete now
        connection = LegacyManagedBearerSsoConnection(SONO_URL, SONO_REGION, listOf("codecatalyst:read_write"))
        Disposer.register(disposable, connection)
        // pin connection to avoid dialog prompt
        ConnectionPinningManager.getInstance().setPinnedConnection(CodeCatalystConnection.getInstance(), connection)
        (connection.getConnectionSettings().tokenProvider.delegate as BearerTokenProvider).reauthenticate()

        (service<JetBrainsClientDownloaderConfigurationProvider>() as TestJetBrainsClientDownloaderConfigurationProvider).apply {
            guestConfigFolder = tempDir.resolve("config")
            guestSystemFolder = tempDir.resolve("system")
            guestLogFolder = tempDir.resolve("log")
        }
    }

    private lateinit var connectionHandle: GatewayConnectionHandle

    @TestFactory
    @Timeout(value = 5, unit = TimeUnit.MINUTES)
    fun `test connect to devenv`(): Iterator<DynamicTest> = sequence<DynamicTest> {
        connectionHandle = runBlocking {
            CawsConnectionProvider().connect(
                mapOf(
                    CawsConnectionParameters.CAWS_SPACE to environment.spaceName,
                    CawsConnectionParameters.CAWS_PROJECT to environment.projectName,
                    CawsConnectionParameters.CAWS_ENV_ID to environment.id,
                ),
                ConnectionRequestor.Local
            )
        } ?: error("null connection handle")

        yield(test(::`wait for environment ready`))

        // inject token to backend launcher script to enable the host status endpoint
        println(
            ssmFactory.executeSshCommand {
                it.addToRemoteCommand(
                    """
                    grep -q "CWM_HOST_STATUS_OVER_HTTP_TOKEN" $IDE_BACKEND_DIR/bin/remote-dev-server.sh || sed -i.bak '2iexport CWM_HOST_STATUS_OVER_HTTP_TOKEN=$hostToken' $IDE_BACKEND_DIR/bin/remote-dev-server.sh
                    """.trimIndent()
                )
            }
        )

        yieldAll(
            listOf(
                test(::`poll for bootstrap script availability`),
                test(::`wait for backend start`),
                test(::`wait for backend connect`)
            )
        )
    }.iterator()

    fun `wait for environment ready`() = runBlocking {
        waitUntil(
            succeedOn = {
                it.status() == DevEnvironmentStatus.RUNNING
            },
            failOn = {
                it.status() == DevEnvironmentStatus.FAILED || it.status() == DevEnvironmentStatus.DELETED
            },
            maxDuration = Duration.ofMinutes(2),
            call = {
                client.getDevEnvironment {
                    it.spaceName(environment.spaceName)
                    it.projectName(environment.projectName)
                    it.id(environment.id)
                }
            }
        )
    }

    fun `poll for bootstrap script availability`() = runBlocking {
        waitUntil(
            succeedOn = {
                it == StdOutResult.SUCCESS
            },
            failOn = {
                connectionHandle.lifetime.isNotAlive
            },
            maxDuration = Duration.ofMinutes(5),
            call = {
                // condition looks inverted because we want failure if script not found
                ssmFactory
                    .executeCommandNonInteractive("sh", "-c", "test -z \"\$(find /tmp -name \"start-ide.sh\" 2>/dev/null)\" && echo false || echo true")
                    .resultFromStdOut()
            }
        )
    }

    fun `wait for backend start`() = runBlocking {
        // make sure port forward is alive
        lazyPortForward.value

        waitUntil(
            succeedOn = {
                it != null
            },
            failOn = { connectionHandle.lifetime.isNotAlive },
            maxDuration = Duration.ofMinutes(5),
            call = {
                tryOrNull {
                    HttpRequests.request(endpoint).readString()
                }
            }
        )
    }

    fun `wait for backend connect`() = runBlocking {
        waitUntil(
            succeedOn = { status ->
                status?.projects?.any { it.users.size > 1 } == true
            },
            failOn = { connectionHandle.lifetime.isNotAlive },
            maxDuration = Duration.ofMinutes(5),
            call = {
                // can potentially have a socket reset which will lead to a very confusing error that's hard to debug
                // due to the Gateway connection executor continuing to run
                tryOrNull {
                    UnattendedHostStatus.fromJson(HttpRequests.request(endpoint).readString())
                }
            }
        )

        ThinClientTrackerService.getInstance().closeThinClient(environment.id)
    }

    override fun afterAll(context: ExtensionContext) {
        if (lazyPortForward.isInitialized()) {
            lazyPortForward.value.destroyProcess()
        }
    }

    private fun test(testRef: KFunction<*>) = DynamicTest.dynamicTest(testRef.name) { testRef.call() }
}
