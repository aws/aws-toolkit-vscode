// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import software.aws.toolkits.core.credentials.ToolkitCredentialsIdentifier
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.rules.EnvironmentVariableHelper
import software.aws.toolkits.jetbrains.core.MockResourceCache
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.spinUntil
import software.aws.toolkits.jetbrains.utils.toElement
import java.nio.file.Files
import java.time.Duration

class DefaultProjectAccountSettingsManagerTest {
    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val environmentVariableHelper = EnvironmentVariableHelper()

    private lateinit var mockRegionManager: MockRegionProvider
    private lateinit var mockCredentialManager: MockCredentialsManager
    private lateinit var manager: DefaultProjectAccountSettingsManager
    private lateinit var mockResourceCache: MockResourceCache
    private lateinit var queue: MutableList<Any>

    @Before
    fun setUp() {
        // Isolate our tests
        System.getProperties().setProperty("aws.configFile", Files.createTempFile("dummy", null).toAbsolutePath().toString())
        System.getProperties().setProperty("aws.sharedCredentialsFile", Files.createTempFile("dummy", null).toAbsolutePath().toString())
        System.getProperties().remove("aws.region")
        environmentVariableHelper.remove("AWS_REGION")

        queue = mutableListOf()

        mockRegionManager = MockRegionProvider.getInstance()
        mockCredentialManager = MockCredentialsManager.getInstance()
        manager = DefaultProjectAccountSettingsManager(projectRule.project)
        mockResourceCache = MockResourceCache.getInstance(projectRule.project)
    }

    @After
    fun tearDown() {
        mockRegionManager.reset()
        mockCredentialManager.reset()
        mockResourceCache.clear()
    }

    @Test
    fun testNoActiveCredentials() {
        assertThat(manager.isValidConnectionSettings()).isFalse()
        assertThat(manager.recentlyUsedCredentials()).isEmpty()
    }

    @Test
    fun testMakingCredentialActive() {
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
    fun testMakingRegionActive() {
        val mockRegionProvider = MockRegionProvider.getInstance()
        val mockRegion1 = mockRegionProvider.addRegion(AwsRegion("MockRegion-1", "MockRegion-1", "aws"))
        val mockRegion2 = mockRegionProvider.addRegion(AwsRegion("MockRegion-2", "MockRegion-2", "aws"))

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
    fun testMakingRegionActiveFiresNotification() {
        val project = projectRule.project

        var gotNotification = false

        val busConnection = project.messageBus.connect()
        busConnection.subscribe(ProjectAccountSettingsManager.CONNECTION_SETTINGS_CHANGED, object : ConnectionSettingsChangeNotifier {
            override fun settingsChanged(event: ConnectionSettingsChangeEvent) {
                gotNotification = true
            }
        })

        changeRegion(AwsRegionProvider.getInstance().defaultRegion())

        assertThat(gotNotification).isTrue()
    }

    @Test
    fun testMakingCredentialsActiveFiresNotification() {
        val project = projectRule.project

        var gotNotification = false

        val busConnection = project.messageBus.connect()
        busConnection.subscribe(ProjectAccountSettingsManager.CONNECTION_SETTINGS_CHANGED, object : ConnectionSettingsChangeNotifier {
            override fun settingsChanged(event: ConnectionSettingsChangeEvent) {
                gotNotification = true
            }
        })

        changeCredentialProvider(
            mockCredentialManager.addCredentials("Mock")
        )

        assertThat(gotNotification).isTrue()
    }

    @Test
    fun testSavingActiveRegion() {
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
    fun testSavingActiveCredential() {
        mockResourceCache.addValidAwsCredential(manager.activeRegion.id, "Mock", "222222222222")
        changeCredentialProvider(mockCredentialManager.addCredentials("Mock"))
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
    fun testLoadingActiveCredential() {
        val element = """
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
        markConnectionSettingsAsValid(credentials, MockRegionProvider.getInstance().defaultRegion())

        deserializeAndLoadState(manager, element)

        waitForTerminalConnectionState()

        assertThat(manager.selectedCredentialIdentifier).isEqualTo(credentials)
        assertThat(manager.recentlyUsedCredentials()).element(0).isEqualTo(credentials)
    }

    @Test
    fun testLoadingActiveRegion() {
        val element = """
            <AccountState>
                <option name="activeRegion" value="${MockRegionProvider.getInstance().defaultRegion().id}" />
                <option name="recentlyUsedRegions">
                    <list>
                        <option value="${MockRegionProvider.getInstance().defaultRegion().id}" />
                    </list>
                </option>
            </AccountState>
        """.toElement()

        deserializeAndLoadState(manager, element)

        waitForTerminalConnectionState()

        val region = mockRegionManager.lookupRegionById(MockRegionProvider.getInstance().defaultRegion().id)
        assertThat(manager.selectedRegion).isEqualTo(region)
        assertThat(manager.selectedPartition?.id).isEqualTo(region.partitionId)
        assertThat(manager.recentlyUsedRegions()).element(0).isEqualTo(region)
    }

    @Test
    fun testLoadingRegionThatNoLongerExistsReturnsNull() {
        val element = """
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

        waitForTerminalConnectionState()

        assertThat(manager.connectionSettings()?.region).isNull()
        assertThat(manager.recentlyUsedRegions()).isEmpty()
    }

    @Test
    fun testLoadingCredentialThatNoLongerExistsReturnsNull() {
        val element = """
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

        waitForTerminalConnectionState()

        assertThat(manager.isValidConnectionSettings()).isFalse()
        assertThat(manager.recentlyUsedCredentials()).isEmpty()
        assertThat(manager.connectionSettings()).isNull()
    }

    @Test
    fun testLoadingInvalidActiveCredentialNotSelected() {
        val mockCredentials = mockCredentialManager.addCredentials("Mock")

        markConnectionSettingsAsInvalid(mockCredentials, MockRegionProvider.getInstance().defaultRegion())

        val element = """
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

        waitForTerminalConnectionState()

        assertThat(manager.isValidConnectionSettings()).isFalse()
    }

    @Test
    fun testLoadingDefaultProfileIfNoPrevious() {
        val credentials = mockCredentialManager.addCredentials("profile:default")
        markConnectionSettingsAsValid(credentials, MockRegionProvider.getInstance().defaultRegion())

        val element = """
            <AccountState/>
        """.toElement()

        deserializeAndLoadState(manager, element)

        waitForTerminalConnectionState()

        assertThat(manager.isValidConnectionSettings()).isTrue()
        assertThat(manager.connectionSettings()?.credentials?.id).isEqualTo("profile:default")

        assertThat(manager.recentlyUsedCredentials()).hasSize(1)
        assertThat(manager.recentlyUsedCredentials().first().id).isEqualTo("profile:default")
    }

    @Test
    fun testRemovingActiveProfileFallsBackToNothing() {
        val defaultCredentials = mockCredentialManager.addCredentials("profile:default")
        val adminCredentials = mockCredentialManager.addCredentials("profile:admin")

        markConnectionSettingsAsValid(defaultCredentials, AwsRegionProvider.getInstance().defaultRegion())
        markConnectionSettingsAsValid(adminCredentials, AwsRegionProvider.getInstance().defaultRegion())

        changeRegion(AwsRegionProvider.getInstance().defaultRegion())
        changeCredentialProvider(adminCredentials)

        assertThat(manager.isValidConnectionSettings()).isTrue()

        assertThat(manager.selectedCredentialIdentifier?.id).isEqualTo("profile:admin")

        ApplicationManager.getApplication().messageBus.syncPublisher(CredentialManager.CREDENTIALS_CHANGED).providerRemoved(adminCredentials)

        assertThat(manager.isValidConnectionSettings()).isFalse()
        assertThat(manager.selectedCredentialIdentifier).isNull()
        assertThat(manager.connectionSettings()).isNull()
    }

    private fun markConnectionSettingsAsValid(credentialsIdentifier: ToolkitCredentialsIdentifier, region: AwsRegion) {
        mockResourceCache.addValidAwsCredential(region.id, credentialsIdentifier.id, "1111222233333")
    }

    private fun markConnectionSettingsAsInvalid(credentialsIdentifier: ToolkitCredentialsIdentifier, region: AwsRegion) {
        mockResourceCache.addInvalidAwsCredential(region.id, credentialsIdentifier.id)
    }

    private fun changeCredentialProvider(credentialsProvider: ToolkitCredentialsIdentifier) {
        manager.changeCredentialProvider(credentialsProvider)

        waitForTerminalConnectionState()
    }

    private fun changeRegion(region: AwsRegion) {
        manager.changeRegion(region)

        waitForTerminalConnectionState()
    }

    private fun waitForTerminalConnectionState() {
        spinUntil(Duration.ofSeconds(10)) { manager.connectionState == ConnectionState.VALID || manager.connectionState == ConnectionState.INVALID }
    }

    private fun Element?.string(): String = XMLOutputter().outputString(this)
}
