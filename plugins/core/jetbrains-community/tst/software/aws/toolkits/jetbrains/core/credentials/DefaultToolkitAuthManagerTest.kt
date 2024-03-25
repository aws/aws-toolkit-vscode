// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.replaceService
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.Mockito.mockConstruction
import org.mockito.kotlin.any
import org.mockito.kotlin.doNothing
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyNoMoreInteractions
import org.mockito.kotlin.whenever
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.credentials.profiles.ProfileSsoSessionIdentifier
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenAuthState
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProviderListener
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.InteractiveBearerTokenProvider
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.jetbrains.utils.isInstanceOf
import software.aws.toolkits.jetbrains.utils.isInstanceOfSatisfying

class DefaultToolkitAuthManagerTest {
    @JvmField
    @Rule
    val applicationRule = ApplicationRule()

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val regionProvider = MockRegionProviderRule()

    @JvmField
    @Rule
    val disposableRule = DisposableRule()

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule()

    private lateinit var sut: DefaultToolkitAuthManager

    private lateinit var connectionManager: ToolkitConnectionManager

    @Before
    fun setUp() {
        mockClientManager.create<SsoOidcClient>()
        sut = DefaultToolkitAuthManager()
        connectionManager = DefaultToolkitConnectionManager()
    }

    @Test
    fun `creates ManagedBearerSsoConnection from ManagedSsoProfile`() {
        val profile = ManagedSsoProfile(
            "us-east-1",
            aString(),
            listOf(aString())
        )
        val connection = sut.createConnection(profile)

        assertThat(connection).isInstanceOf<ManagedBearerSsoConnection>()
        connection as ManagedBearerSsoConnection
        assertThat(connection.region).isEqualTo(profile.ssoRegion)
        assertThat(connection.startUrl).isEqualTo(profile.startUrl)
        assertThat(connection.scopes).isEqualTo(profile.scopes)
    }

    @Test
    fun `creates ManagedBearerSsoConnection from serialized ManagedSsoProfile`() {
        val profile = ManagedSsoProfile(
            "us-east-1",
            aString(),
            listOf(aString())
        )
        sut.createConnection(profile)

        assertThat(sut.state?.ssoProfiles).satisfies { profiles ->
            assertThat(profiles).isNotNull()
            assertThat(profiles).singleElement().isEqualTo(profile)
        }
    }

    @Test
    fun `serializes ManagedSsoProfile from ManagedBearerSsoConnection`() {
        val profile = ManagedSsoProfile(
            "us-east-1",
            aString(),
            listOf(aString())
        )

        sut.loadState(
            ToolkitAuthManagerState(
                ssoProfiles = listOf(profile)
            )
        )

        assertThat(sut.listConnections()).singleElement().satisfies {
            assertThat(it).isInstanceOfSatisfying<ManagedBearerSsoConnection> { connection ->
                assertThat(connection.region).isEqualTo(profile.ssoRegion)
                assertThat(connection.startUrl).isEqualTo(profile.startUrl)
                assertThat(connection.scopes).isEqualTo(profile.scopes)
            }
        }
    }

    @Test
    fun `loadState dedupes profiles`() {
        val profile = ManagedSsoProfile(
            "us-east-1",
            aString(),
            listOf(aString())
        )

        sut.loadState(
            ToolkitAuthManagerState(
                ssoProfiles = listOf(
                    profile,
                    profile,
                    profile
                )
            )
        )

        assertThat(sut.listConnections()).singleElement().satisfies {
            assertThat(it).isInstanceOfSatisfying<ManagedBearerSsoConnection> { connection ->
                assertThat(connection.region).isEqualTo(profile.ssoRegion)
                assertThat(connection.startUrl).isEqualTo(profile.startUrl)
                assertThat(connection.scopes).isEqualTo(profile.scopes)
            }
        }
    }

    @Test
    fun `updates connection list from connection bus`() {
        assertThat(sut.listConnections()).isEmpty()

        val scopes = listOf("scope1", "scope2")
        val publisher = ApplicationManager.getApplication().messageBus.syncPublisher(CredentialManager.CREDENTIALS_CHANGED)

        publisher.ssoSessionAdded(
            ProfileSsoSessionIdentifier(
                "add",
                "startUrl",
                "us-east-1",
                scopes.toSet()
            )
        )

        assertThat(sut.listConnections()).singleElement().satisfies {
            assertThat(it).isInstanceOfSatisfying<ManagedBearerSsoConnection> { connection ->
                assertThat(connection.region).isEqualTo("us-east-1")
                assertThat(connection.startUrl).isEqualTo("startUrl")
                assertThat(connection.scopes).isEqualTo(scopes)
            }
        }

        publisher.ssoSessionModified(
            ProfileSsoSessionIdentifier(
                "add",
                "startUrl2",
                "us-east-1",
                scopes.toSet()
            )
        )

        assertThat(sut.listConnections()).singleElement().satisfies {
            assertThat(it).isInstanceOfSatisfying<ManagedBearerSsoConnection> { connection ->
                assertThat(connection.region).isEqualTo("us-east-1")
                assertThat(connection.startUrl).isEqualTo("startUrl2")
                assertThat(connection.scopes).isEqualTo(scopes)
            }
        }

        publisher.ssoSessionRemoved(
            ProfileSsoSessionIdentifier(
                "add",
                "startUrl2",
                "us-east-1",
                scopes.toSet()
            )
        )

        assertThat(sut.listConnections()).isEmpty()
    }

    @Test
    fun `loginSso with an working existing connection`() {
        val connectionManager: ToolkitConnectionManager = mock()
        regionProvider.addRegion(Region.US_EAST_1)
        projectRule.project.replaceService(ToolkitConnectionManager::class.java, connectionManager, disposableRule.disposable)
        ApplicationManager.getApplication().replaceService(ToolkitAuthManager::class.java, sut, disposableRule.disposable)

        mockConstruction(InteractiveBearerTokenProvider::class.java) { context, _ ->
            whenever(context.state()).thenReturn(BearerTokenAuthState.AUTHORIZED)
        }.use {
            val existingConnection = sut.createConnection(
                ManagedSsoProfile(
                    "us-east-1",
                    "foo",
                    emptyList()
                )
            )

            loginSso(projectRule.project, "foo", "us-east-1", emptyList())

            val tokenProvider = it.constructed()[0]
            verify(tokenProvider).state()
            verifyNoMoreInteractions(tokenProvider)
            verify(connectionManager).switchConnection(eq(existingConnection))
        }
    }

    @Test
    fun `loginSso with an existing connection but expired and refresh token is valid, should refreshToken`() {
        val connectionManager: ToolkitConnectionManager = mock()
        regionProvider.addRegion(Region.US_EAST_1)
        projectRule.project.replaceService(ToolkitConnectionManager::class.java, connectionManager, disposableRule.disposable)
        ApplicationManager.getApplication().replaceService(ToolkitAuthManager::class.java, sut, disposableRule.disposable)

        mockConstruction(InteractiveBearerTokenProvider::class.java) { context, _ ->
            whenever(context.id).thenReturn("id")
            whenever(context.state()).thenReturn(BearerTokenAuthState.NEEDS_REFRESH)
        }.use {
            val existingConnection = sut.createConnection(
                ManagedSsoProfile(
                    "us-east-1",
                    "foo",
                    emptyList()
                )
            )

            loginSso(projectRule.project, "foo", "us-east-1", emptyList())

            val tokenProvider = it.constructed()[0]
            verify(tokenProvider).resolveToken()
            verify(connectionManager).switchConnection(eq(existingConnection))
        }
    }

    @Test
    fun `loginSso with an existing connection that token is invalid and there's no refresh token, should re-authenticate`() {
        val connectionManager: ToolkitConnectionManager = mock()
        regionProvider.addRegion(Region.US_EAST_1)
        projectRule.project.replaceService(ToolkitConnectionManager::class.java, connectionManager, disposableRule.disposable)
        ApplicationManager.getApplication().replaceService(ToolkitAuthManager::class.java, sut, disposableRule.disposable)

        mockConstruction(InteractiveBearerTokenProvider::class.java) { context, _ ->
            whenever(context.state()).thenReturn(BearerTokenAuthState.NOT_AUTHENTICATED)
        }.use {
            val existingConnection = sut.createConnection(
                ManagedSsoProfile(
                    "us-east-1",
                    "foo",
                    emptyList()
                )
            )

            loginSso(projectRule.project, "foo", "us-east-1", emptyList())

            val tokenProvider = it.constructed()[0]
            verify(tokenProvider).reauthenticate()
            verify(connectionManager).switchConnection(eq(existingConnection))
        }
    }

    @Test
    fun `loginSso reuses connection if requested scopes are subset of existing`() {
        val connectionManager: ToolkitConnectionManager = mock()
        regionProvider.addRegion(Region.US_EAST_1)
        projectRule.project.replaceService(ToolkitConnectionManager::class.java, connectionManager, disposableRule.disposable)
        ApplicationManager.getApplication().replaceService(ToolkitAuthManager::class.java, sut, disposableRule.disposable)

        mockConstruction(InteractiveBearerTokenProvider::class.java) { context, _ ->
            whenever(context.state()).thenReturn(BearerTokenAuthState.AUTHORIZED)
        }.use {
            val existingConnection = sut.createConnection(
                ManagedSsoProfile(
                    "us-east-1",
                    "foo",
                    listOf("existing1", "existing2", "existing3")
                )
            )

            loginSso(projectRule.project, "foo", "us-east-1", listOf("existing1"))

            val tokenProvider = it.constructed()[0]
            verify(tokenProvider).state()
            verifyNoMoreInteractions(tokenProvider)
            verify(connectionManager).switchConnection(eq(existingConnection))
        }
    }

    @Test
    fun `loginSso forces reauth if requested scopes are not complete subset`() {
        regionProvider.addRegion(Region.US_EAST_1)

        projectRule.project.replaceService(ToolkitConnectionManager::class.java, connectionManager, disposableRule.disposable)
        ApplicationManager.getApplication().replaceService(ToolkitAuthManager::class.java, sut, disposableRule.disposable)

        mockConstruction(InteractiveBearerTokenProvider::class.java) { context, _ ->
            whenever(context.state()).thenReturn(BearerTokenAuthState.AUTHORIZED)
        }.use {
            val existingConnection = sut.createConnection(
                ManagedSsoProfile(
                    "us-east-1",
                    "foo",
                    listOf("existing1", "existing2", "existing3")
                )
            )

            val newScopes = listOf("existing1", "new1")
            loginSso(projectRule.project, "foo", "us-east-1", newScopes)

            assertThat(connectionManager.activeConnection() as AwsBearerTokenConnection).satisfies { connection ->
                assertThat(connection.scopes.toSet()).isEqualTo(setOf("existing1", "existing2", "existing3", "new1"))
            }
            assertThat(sut.listConnections()).singleElement().isInstanceOfSatisfying<AwsBearerTokenConnection> { connection ->
                assertThat(connection).usingRecursiveComparison().isNotEqualTo(existingConnection)
                assertThat(connection.scopes.toSet()).isEqualTo(setOf("existing1", "existing2", "existing3", "new1"))
            }
        }
    }

    @Test
    fun `loginSso with a new connection`() {
        val connectionManager: ToolkitConnectionManager = mock()
        ApplicationManager.getApplication().replaceService(ToolkitAuthManager::class.java, sut, disposableRule.disposable)
        projectRule.project.replaceService(ToolkitConnectionManager::class.java, connectionManager, disposableRule.disposable)

        mockConstruction(InteractiveBearerTokenProvider::class.java) { context, _ ->
            doNothing().whenever(context).reauthenticate()
            whenever(context.state()).thenReturn(BearerTokenAuthState.NOT_AUTHENTICATED)
        }.use {
            // before
            assertThat(sut.listConnections()).hasSize(0)

            loginSso(projectRule.project, "foo", "us-east-1", listOf("scope1", "scope2"))

            // after
            assertThat(sut.listConnections()).hasSize(1)
            verify(connectionManager).switchConnection(any())

            val expectedConnection = LegacyManagedBearerSsoConnection(
                "foo",
                "us-east-1",
                listOf("scope1", "scope2")
            )

            sut.listConnections()[0].let { conn ->
                assertThat(conn.getConnectionSettings())
                    .usingRecursiveComparison()
                    .isEqualTo(expectedConnection.getConnectionSettings())
                assertThat(conn.id).isEqualTo(expectedConnection.id)
                assertThat(conn.label).isEqualTo(expectedConnection.label)
            }
        }
    }

    @Test
    fun `logoutFromConnection should invalidate the token provider and the connection and invoke callback`() {
        regionProvider.addRegion(Region.US_EAST_1)

        projectRule.project.replaceService(ToolkitConnectionManager::class.java, connectionManager, disposableRule.disposable)

        val profile = ManagedSsoProfile("us-east-1", "startUrl000")
        val connection = ToolkitAuthManager.getInstance().createConnection(profile) as ManagedBearerSsoConnection
        connectionManager.switchConnection(connection)

        var providerInvalidatedMessageReceived = 0
        var connectionSwitchedMessageReceived = 0
        var callbackInvoked = 0
        ApplicationManager.getApplication().messageBus.connect().subscribe(
            BearerTokenProviderListener.TOPIC,
            object : BearerTokenProviderListener {
                override fun invalidate(providerId: String) {
                    if (providerId == "sso;us-east-1;startUrl000") {
                        providerInvalidatedMessageReceived += 1
                    }
                }
            }
        )
        ApplicationManager.getApplication().messageBus.connect().subscribe(
            ToolkitConnectionManagerListener.TOPIC,
            object : ToolkitConnectionManagerListener {
                override fun activeConnectionChanged(newConnection: ToolkitConnection?) {
                    connectionSwitchedMessageReceived += 1
                }
            }
        )

        logoutFromSsoConnection(projectRule.project, connection) { callbackInvoked += 1 }
        assertThat(providerInvalidatedMessageReceived).isEqualTo(1)
        assertThat(connectionSwitchedMessageReceived).isEqualTo(1)
        assertThat(callbackInvoked).isEqualTo(1)
    }
}
