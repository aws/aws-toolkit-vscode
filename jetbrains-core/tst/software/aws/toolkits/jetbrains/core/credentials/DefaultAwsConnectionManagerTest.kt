// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.configurationStore.deserializeAndLoadState
import com.intellij.configurationStore.serializeStateInto
import com.intellij.openapi.application.ApplicationManager
import org.assertj.core.api.Assertions.assertThat
import org.jdom.Element
import org.jdom.output.XMLOutputter
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.credentials.aCredentialsIdentifier
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.rules.EnvironmentVariableHelper
import software.aws.toolkits.core.utils.test.notNull
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager.Companion.selectedPartition
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.jetbrains.core.region.getDefaultRegion
import software.aws.toolkits.jetbrains.services.sts.StsResources
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.toElement
import java.nio.file.Files
import java.util.concurrent.CompletableFuture

class DefaultAwsConnectionManagerTest {
    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val environmentVariableHelper = EnvironmentVariableHelper()

    @Rule
    @JvmField
    val mockCredentialManager = MockCredentialManagerRule()

    @Rule
    @JvmField
    val regionProviderRule = MockRegionProviderRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    private lateinit var manager: DefaultAwsConnectionManager

    @Before
    fun setUp() {
        // Isolate our tests
        System.getProperties().setProperty("aws.configFile", Files.createTempFile("dummy", null).toAbsolutePath().toString())
        System.getProperties().setProperty("aws.sharedCredentialsFile", Files.createTempFile("dummy", null).toAbsolutePath().toString())
        System.getProperties().remove("aws.region")
        environmentVariableHelper.remove("AWS_REGION")
        manager = DefaultAwsConnectionManager(projectRule.project)
    }

    @After
    fun tearDown() {
        mockCredentialManager.reset()
    }

    @Test
    fun `Starts with no active credentials`() {
        assertThat(manager.isValidConnectionSettings()).isFalse()
        assertThat(manager.recentlyUsedCredentials()).isEmpty()
    }

    @Test
    fun `On load, automatically selects default profile if present and no other active credentials`() {
        val credentials = mockCredentialManager.addCredentials(DEFAULT_PROFILE_ID)
        markConnectionSettingsAsValid(credentials, AwsRegionProvider.getInstance().defaultRegion())

        manager.noStateLoaded()
        manager.waitUntilConnectionStateIsStable()

        assertThat(manager.selectedCredentialIdentifier).notNull.satisfies {
            assertThat(it.id).isEqualTo(credentials.id)
        }
    }

    @Test
    fun `On load, default region of credential is used if there is no other active region`() {
        val element =
            """
            <AccountState>
                <option name="activeProfile" value="Mock" />
            </AccountState>
        """.toElement()

        val region = AwsRegion("us-west-2", "Oregon", "AWS")
        val credentials = mockCredentialManager.addCredentials(id = "Mock", region = region)
        markConnectionSettingsAsValid(credentials, regionProviderRule.defaultRegion())
        regionProviderRule.addRegion(region)

        deserializeAndLoadState(manager, element)

        manager.waitUntilConnectionStateIsStable()

        assertThat(manager.selectedRegion).notNull.satisfies {
            assertThat(it.id).isEqualTo("us-west-2")
        }
    }

    @Test
    fun `Activated credential are validated and added to the recently used list`() {
        changeRegion(AwsRegionProvider.getInstance().defaultRegion())

        assertThat(manager.recentlyUsedCredentials()).isEmpty()

        val credentials = mockCredentialManager.addCredentials("Mock1")
        val credentials2 = mockCredentialManager.addCredentials("Mock2")

        markConnectionSettingsAsValid(credentials, AwsRegionProvider.getInstance().defaultRegion())
        markConnectionSettingsAsValid(credentials2, AwsRegionProvider.getInstance().defaultRegion())

        changeCredentialProvider(credentials)

        assertThat(manager.isValidConnectionSettings()).isTrue()
        assertThat(manager.connectionSettings()?.credentials?.id).isEqualTo(credentials.id)

        assertThat(manager.recentlyUsedCredentials()).element(0).isEqualTo(credentials)

        changeCredentialProvider(credentials2)

        assertThat(manager.isValidConnectionSettings()).isTrue()
        assertThat(manager.connectionSettings()?.credentials?.id).isEqualTo(credentials2.id)

        assertThat(manager.recentlyUsedCredentials()).element(0).isEqualTo(credentials2)
        assertThat(manager.recentlyUsedCredentials()).element(1).isEqualTo(credentials)
    }

    @Test
    fun `Activated regions are validated and added to the recently used list`() {
        val mockRegion1 = regionProviderRule.addRegion(AwsRegion("MockRegion-1", "MockRegion-1", "aws"))
        val mockRegion2 = regionProviderRule.addRegion(AwsRegion("MockRegion-2", "MockRegion-2", "aws"))

        assertThat(manager.recentlyUsedRegions()).isEmpty()

        changeRegion(mockRegion1)

        assertThat(manager.selectedRegion).isEqualTo(mockRegion1)
        assertThat(manager.recentlyUsedRegions()).element(0).isEqualTo(mockRegion1)

        changeRegion(mockRegion2)

        assertThat(manager.selectedRegion).isEqualTo(mockRegion2)
        assertThat(manager.recentlyUsedRegions()).element(0).isEqualTo(mockRegion2)
        assertThat(manager.recentlyUsedRegions()).element(1).isEqualTo(mockRegion1)
    }

    @Test
    fun `Activating a region fires a state change notification`() {
        val project = projectRule.project

        var gotNotification = false

        val busConnection = project.messageBus.connect()
        busConnection.subscribe(
            AwsConnectionManager.CONNECTION_SETTINGS_STATE_CHANGED,
            object : ConnectionSettingsStateChangeNotifier {
                override fun settingsStateChanged(newState: ConnectionState) {
                    gotNotification = true
                }
            }
        )

        changeRegion(AwsRegionProvider.getInstance().defaultRegion())

        assertThat(gotNotification).isTrue()
    }

    @Test
    fun `Activating a credential fires a state change notification`() {
        val project = projectRule.project

        var gotNotification = false

        val busConnection = project.messageBus.connect()
        busConnection.subscribe(
            AwsConnectionManager.CONNECTION_SETTINGS_STATE_CHANGED,
            object : ConnectionSettingsStateChangeNotifier {
                override fun settingsStateChanged(newState: ConnectionState) {
                    gotNotification = true
                }
            }
        )

        changeCredentialProvider(
            mockCredentialManager.addCredentials("Mock")
        )

        assertThat(gotNotification).isTrue()
    }

    @Test
    fun `Active region is persisted`() {
        manager.changeRegion(AwsRegion.GLOBAL)
        val element = Element("AccountState")
        serializeStateInto(manager, element)
        assertThat(element.string()).isEqualToIgnoringWhitespace(
            """
            <AccountState>
                <option name="activeRegion" value="aws-global" />
                <option name="recentlyUsedRegions">
                    <list>
                        <option value="aws-global" />
                    </list>
                </option>
            </AccountState>
            """
        )
    }

    @Test
    fun `Active credential is persisted`() {
        val credentials = mockCredentialManager.addCredentials("Mock")
        markConnectionSettingsAsValid(credentials, manager.activeRegion)
        changeCredentialProvider(credentials)

        val element = Element("AccountState")
        serializeStateInto(manager, element)
        assertThat(element.string()).isEqualToIgnoringWhitespace(
            """
            <AccountState>
                <option name="activeProfile" value="Mock" />
                <option name="recentlyUsedProfiles">
                    <list>
                        <option value="Mock" />
                    </list>
                </option>
            </AccountState>
            """
        )
    }

    @Test
    fun `Active credential can be restored from persistence`() {
        val element =
            """
            <AccountState>
                <option name="activeProfile" value="Mock" />
                <option name="recentlyUsedProfiles">
                    <list>
                        <option value="Mock" />
                    </list>
                </option>
            </AccountState>
        """.toElement()

        val credentials = mockCredentialManager.addCredentials("Mock")
        markConnectionSettingsAsValid(credentials, regionProviderRule.defaultRegion())

        deserializeAndLoadState(manager, element)

        manager.waitUntilConnectionStateIsStable()

        assertThat(manager.selectedCredentialIdentifier).isEqualTo(credentials)
        assertThat(manager.recentlyUsedCredentials()).element(0).isEqualTo(credentials)
    }

    @Test
    fun `Active region can be restored from persistence`() {
        val element =
            """
            <AccountState>
                <option name="activeRegion" value="${getDefaultRegion().id}" />
                <option name="recentlyUsedRegions">
                    <list>
                        <option value="${getDefaultRegion().id}" />
                    </list>
                </option>
            </AccountState>
        """.toElement()

        deserializeAndLoadState(manager, element)

        manager.waitUntilConnectionStateIsStable()

        val region = regionProviderRule.defaultRegion()
        assertThat(manager.selectedRegion).isEqualTo(region)
        assertThat(manager.selectedPartition?.id).isEqualTo(region.partitionId)
        assertThat(manager.recentlyUsedRegions()).element(0).isEqualTo(region)
    }

    @Test
    fun `Attempting to restore a region that no longer exists is handled gracefully`() {
        val element =
            """
            <AccountState>
                <option name="activeRegion" value="DoesNotExist" />
                <option name="recentlyUsedRegions">
                    <list>
                        <option value="DoesNotExist" />
                    </list>
                </option>
            </AccountState>
        """.toElement()
        deserializeAndLoadState(manager, element)

        manager.waitUntilConnectionStateIsStable()

        assertThat(manager.connectionSettings()?.region).isNull()
        assertThat(manager.recentlyUsedRegions()).isEmpty()
    }

    @Test
    fun `Attempting to restore a credential that no longer exists is handled gracefully`() {
        val element =
            """
            <AccountState>
                <option name="activeProfile" value="DoesNotExist" />
                <option name="recentlyUsedProfiles">
                    <list>
                        <option value="DoesNotExist" />
                    </list>
                </option>
            </AccountState>
        """.toElement()

        deserializeAndLoadState(manager, element)

        manager.waitUntilConnectionStateIsStable()

        assertThat(manager.isValidConnectionSettings()).isFalse()
        assertThat(manager.recentlyUsedCredentials()).isEmpty()
        assertThat(manager.connectionSettings()).isNull()
    }

    @Test
    fun `Credentials are validated when restored from persistence`() {
        val mockCredentials = mockCredentialManager.addCredentials("Mock")

        markConnectionSettingsAsInvalid(mockCredentials, regionProviderRule.defaultRegion())

        val element =
            """
            <AccountState>
                <option name="activeProfile" value="${mockCredentials.id}" />
                <option name="recentlyUsedProfiles">
                    <list>
                        <option value="${mockCredentials.id}" />
                    </list>
                </option>
            </AccountState>
        """.toElement()

        deserializeAndLoadState(manager, element)

        manager.waitUntilConnectionStateIsStable()

        assertThat(manager.isValidConnectionSettings()).isFalse()
    }

    @Test
    fun `On load, default credential is selected if no other credential is active`() {
        val credentials = mockCredentialManager.addCredentials(DEFAULT_PROFILE_ID)
        markConnectionSettingsAsValid(credentials, regionProviderRule.defaultRegion())

        val element =
            """
            <AccountState/>
        """.toElement()

        deserializeAndLoadState(manager, element)

        manager.waitUntilConnectionStateIsStable()

        assertThat(manager.isValidConnectionSettings()).isTrue()
        assertThat(manager.connectionSettings()?.credentials?.id).isEqualTo(DEFAULT_PROFILE_ID)

        assertThat(manager.recentlyUsedCredentials()).hasSize(1)
        assertThat(manager.recentlyUsedCredentials().first().id).isEqualTo(DEFAULT_PROFILE_ID)
    }

    @Test
    fun `Removal of the active credential falls back to 'no credential selected' state`() {
        val someOtherCredential = aCredentialsIdentifier().also { mockCredentialManager.addCredentials(it.id) }
        val adminCredentials = aCredentialsIdentifier().also { mockCredentialManager.addCredentials(it.id) }

        markConnectionSettingsAsValid(someOtherCredential, AwsRegionProvider.getInstance().defaultRegion())
        markConnectionSettingsAsValid(adminCredentials, AwsRegionProvider.getInstance().defaultRegion())

        changeRegion(AwsRegionProvider.getInstance().defaultRegion())
        changeCredentialProvider(adminCredentials)

        assertThat(manager.isValidConnectionSettings()).isTrue()

        assertThat(manager.selectedCredentialIdentifier?.id).isEqualTo(adminCredentials.id)

        ApplicationManager.getApplication().messageBus.syncPublisher(CredentialManager.CREDENTIALS_CHANGED).providerRemoved(adminCredentials)

        assertThat(manager.isValidConnectionSettings()).isFalse()
        assertThat(manager.selectedCredentialIdentifier).isNull()
        assertThat(manager.connectionSettings()).isNull()
    }

    @Test
    fun `Refreshing state triggers connection to be re-validated`() {
        val defaultCredentials = aCredentialsIdentifier().also { mockCredentialManager.addCredentials(it.id) }

        markConnectionSettingsAsInvalid(defaultCredentials, AwsRegionProvider.getInstance().defaultRegion())

        changeRegion(AwsRegionProvider.getInstance().defaultRegion())
        changeCredentialProvider(defaultCredentials)

        assertThat(manager.isValidConnectionSettings()).isFalse()

        markConnectionSettingsAsValid(defaultCredentials, AwsRegionProvider.getInstance().defaultRegion())
        manager.refreshConnectionState()
        manager.waitUntilConnectionStateIsStable()

        assertThat(manager.isValidConnectionSettings()).isTrue()
    }

    @Test
    fun `A change to the selected credential triggers a refresh if the current state is invalid`() {
        val defaultCredentials = aCredentialsIdentifier().also { mockCredentialManager.addCredentials(it.id) }

        markConnectionSettingsAsInvalid(defaultCredentials, AwsRegionProvider.getInstance().defaultRegion())

        changeRegion(AwsRegionProvider.getInstance().defaultRegion())
        changeCredentialProvider(defaultCredentials)

        assertThat(manager.isValidConnectionSettings()).isFalse()

        markConnectionSettingsAsValid(defaultCredentials, AwsRegionProvider.getInstance().defaultRegion())
        ApplicationManager.getApplication().messageBus.syncPublisher(CredentialManager.CREDENTIALS_CHANGED).providerModified(defaultCredentials)
        manager.waitUntilConnectionStateIsStable()

        assertThat(manager.isValidConnectionSettings()).isTrue()
    }

    @Test
    fun `A change to the selected credential triggers a refresh if the current state is valid`() {
        val credentials = aCredentialsIdentifier().also { mockCredentialManager.addCredentials(it.id) }

        markConnectionSettingsAsValid(credentials, AwsRegionProvider.getInstance().defaultRegion())

        changeRegion(AwsRegionProvider.getInstance().defaultRegion())
        changeCredentialProvider(credentials)

        assertThat(manager.isValidConnectionSettings()).isTrue()

        markConnectionSettingsAsInvalid(credentials, AwsRegionProvider.getInstance().defaultRegion())
        ApplicationManager.getApplication().messageBus.syncPublisher(CredentialManager.CREDENTIALS_CHANGED).providerModified(credentials)
        manager.waitUntilConnectionStateIsStable()

        assertThat(manager.isValidConnectionSettings()).isFalse()
    }

    private fun markConnectionSettingsAsValid(credentialsIdentifier: CredentialIdentifier, region: AwsRegion) {
        resourceCache.addEntry(StsResources.ACCOUNT, region.id, credentialsIdentifier.id, "1111222233333")
    }

    private fun markConnectionSettingsAsInvalid(credentialsIdentifier: CredentialIdentifier, region: AwsRegion) {
        resourceCache.addEntry(
            StsResources.ACCOUNT,
            region.id,
            credentialsIdentifier.id,
            CompletableFuture.failedFuture(IllegalStateException("Invalid AWS credentials $credentialsIdentifier"))
        )
    }

    private fun changeCredentialProvider(credentialsProvider: CredentialIdentifier) {
        manager.changeCredentialProvider(credentialsProvider)

        manager.waitUntilConnectionStateIsStable()
    }

    private fun changeRegion(region: AwsRegion) {
        manager.changeRegion(region)

        manager.waitUntilConnectionStateIsStable()
    }

    private fun Element?.string(): String = XMLOutputter().outputString(this)
    companion object {
        const val DEFAULT_PROFILE_ID = "profile:default"
    }
}
