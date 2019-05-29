// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.configurationStore.deserialize
import com.intellij.configurationStore.serialize
import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.ProjectRule
import com.intellij.util.messages.MessageBusConnection
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.jdom.Element
import org.jdom.output.XMLOutputter
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.services.sts.StsClient
import software.aws.toolkits.core.credentials.CredentialProviderNotFound
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import software.aws.toolkits.jetbrains.utils.delegateMock
import software.aws.toolkits.jetbrains.utils.toElement

class DefaultProjectAccountSettingsManagerTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private lateinit var mockRegionManager: MockRegionProvider
    private lateinit var mockCredentialManager: MockCredentialsManager
    private lateinit var manager: DefaultProjectAccountSettingsManager
    private lateinit var messageBusConnection: MessageBusConnection
    private lateinit var queue: MutableList<Any>

    @Before
    fun setUp() {
        queue = mutableListOf()

        mockRegionManager = AwsRegionProvider.getInstance() as MockRegionProvider
        mockCredentialManager = CredentialManager.getInstance() as MockCredentialsManager
        manager = DefaultProjectAccountSettingsManager(projectRule.project, delegateMock<StsClient>())
        messageBusConnection = projectRule.project.messageBus.connect()
        messageBusConnection.subscribe(ProjectAccountSettingsManager.ACCOUNT_SETTINGS_CHANGED, object :
            ProjectAccountSettingsManager.AccountSettingsChangedNotifier {
            override fun settingsChanged(event: ProjectAccountSettingsManager.AccountSettingsChangedNotifier.AccountSettingsEvent) {
                queue.add(event)
            }
        })

        for (i in 1..5) {
            val mockRegion = "MockRegion-$i"
            mockRegionManager.addRegion(AwsRegion(mockRegion, mockRegion))
        }
    }

    @After
    fun tearDown() {
        mockRegionManager.reset()
        mockCredentialManager.reset()
        messageBusConnection.disconnect()
    }

    @Test
    fun testNoActiveCredentials() {
        assertThat(manager.hasActiveCredentials()).isFalse()
        assertThat(manager.recentlyUsedCredentials()).isEmpty()
        assertThatThrownBy { manager.activeCredentialProvider }
            .isInstanceOf(CredentialProviderNotFound::class.java)
    }

    @Test
    fun testMakingCredentialActive() {
        assertThat(manager.recentlyUsedCredentials()).isEmpty()

        val credentials = mockCredentialManager.addCredentials(
            "Mock1",
            AwsBasicCredentials.create("Access", "Secret")
        )
        changeCredentialProvider(credentials)

        assertThat(manager.hasActiveCredentials()).isTrue()
        assertThat(manager.activeCredentialProvider).isEqualTo(credentials)
        assertThat(manager.recentlyUsedCredentials()).element(0).isEqualTo(credentials)

        val credentials2 = mockCredentialManager.addCredentials(
            "Mock2",
            AwsBasicCredentials.create("Access", "Secret")
        )
        changeCredentialProvider(credentials2)

        assertThat(manager.recentlyUsedCredentials()).element(0).isEqualTo(credentials2)
        assertThat(manager.recentlyUsedCredentials()).element(1).isEqualTo(credentials)
    }

    @Test
    fun testMakingRegionActive() {
        assertThat(manager.recentlyUsedCredentials()).isEmpty()

        val region = mockRegionManager.lookupRegionById("MockRegion-1")
        changeRegion(region)

        assertThat(manager.activeRegion).isEqualTo(region)
        assertThat(manager.recentlyUsedRegions()).element(0).isEqualTo(region)

        val region2 = mockRegionManager.lookupRegionById("MockRegion-2")
        changeRegion(region2)

        assertThat(manager.recentlyUsedRegions()).element(0).isEqualTo(region2)
        assertThat(manager.recentlyUsedRegions()).element(1).isEqualTo(region)
    }

    @Test
    fun testMakingRegionActiveFiresNotification() {
        val project = projectRule.project

        var gotNotification = false

        val busConnection = project.messageBus.connect()
        busConnection.subscribe(ProjectAccountSettingsManager.ACCOUNT_SETTINGS_CHANGED, object :
            ProjectAccountSettingsManager.AccountSettingsChangedNotifier {
            override fun settingsChanged(event: ProjectAccountSettingsManager.AccountSettingsChangedNotifier.AccountSettingsEvent) {
                gotNotification = true
            }
        })

        changeRegion(mockRegionManager.lookupRegionById("MockRegion-1"))

        assertThat(gotNotification).isTrue()
    }

    @Test
    fun testMakingCredentialsActiveFiresNotification() {
        val project = projectRule.project

        var gotNotification = false

        val busConnection = project.messageBus.connect()
        busConnection.subscribe(ProjectAccountSettingsManager.ACCOUNT_SETTINGS_CHANGED, object :
            ProjectAccountSettingsManager.AccountSettingsChangedNotifier {
            override fun settingsChanged(event: ProjectAccountSettingsManager.AccountSettingsChangedNotifier.AccountSettingsEvent) {
                gotNotification = true
            }
        })

        changeCredentialProvider(
            mockCredentialManager.addCredentials(
                "Mock",
                AwsBasicCredentials.create("Access", "Secret")
            )
        )

        assertThat(gotNotification).isTrue()
    }

    @Test
    fun testSavingActiveRegion() {
        manager.changeRegion(AwsRegion.GLOBAL)
        val element = serialize(manager.state)
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
        changeCredentialProvider(
            mockCredentialManager.addCredentials(
                "Mock",
                AwsBasicCredentials.create("Access", "Secret")
            )
        )
        val element = serialize(manager.state)
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

        val credentials = mockCredentialManager.addCredentials(
            "Mock",
            AwsBasicCredentials.create("Access", "Secret")
        )

        manager.loadState(element.deserialize(AccountState::class.java))

        waitForEvents(2)

        assertThat(manager.activeCredentialProvider).isEqualTo(credentials)
        assertThat(manager.recentlyUsedCredentials()).element(0).isEqualTo(credentials)
    }

    @Test
    fun testLoadingActiveRegion() {
        val element = """
            <AccountState>
                <option name="activeRegion" value="MockRegion-1" />
                <option name="recentlyUsedRegions">
                    <list>
                        <option value="MockRegion-1" />
                    </list>
                </option>
            </AccountState>
        """.toElement()
        manager.loadState(element.deserialize(AccountState::class.java))

        val region = mockRegionManager.lookupRegionById("MockRegion-1")
        assertThat(manager.activeRegion).isEqualTo(region)
        assertThat(manager.recentlyUsedRegions()).element(0).isEqualTo(region)
    }

    @Test
    fun testLoadingRegionThatNoLongerExists() {
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
        manager.loadState(element.deserialize(AccountState::class.java))

        assertThat(manager.activeRegion).isEqualTo(AwsRegionProvider.getInstance().defaultRegion())
        assertThat(manager.recentlyUsedRegions()).isEmpty()
    }

    @Test
    fun testLoadingCredentialThatNoLongerExists() {
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
        manager.loadState(element.deserialize(AccountState::class.java))

        assertThat(manager.hasActiveCredentials()).isFalse()
        assertThat(manager.recentlyUsedCredentials()).isEmpty()
        assertThatThrownBy { manager.activeCredentialProvider }
            .isInstanceOf(CredentialProviderNotFound::class.java)
    }

    @Test
    fun testLoadingInvalidActiveCredentialNotSelected() {
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

        mockCredentialManager.addCredentials(
            "Mock",
            AwsBasicCredentials.create("Access", "Secret"),
            false
        )

        manager.loadState(element.deserialize(AccountState::class.java))

        assertThat(manager.hasActiveCredentials()).isFalse()
    }

    @Test
    fun testLoadingDefaultProfileIfNoPrevious() {
        mockCredentialManager.addCredentials("profile:default", AwsBasicCredentials.create("Access", "Secret"))

        val element = """
            <AccountState/>
        """.toElement()

        manager.loadState(element.deserialize(AccountState::class.java))

        assertThat(manager.hasActiveCredentials()).isTrue()
        assertThat(manager.recentlyUsedCredentials()).hasOnlyOneElementSatisfying { assertThat(it.id).isEqualTo("profile:default") }
        assertThat(manager.activeCredentialProvider.id).isEqualTo("profile:default")
    }

    @Test
    fun testInvalidDefaultProfileCredentialNotSelected() {
        mockCredentialManager.addCredentials("profile:default", AwsBasicCredentials.create("Access", "Secret"), false)
        assertThat(manager.hasActiveCredentials()).isFalse()
    }

    @Test
    fun testRemovingActiveProfileFallsBackToNothing() {
        mockCredentialManager.addCredentials("profile:default", AwsBasicCredentials.create("Access", "Secret"), true)
        changeCredentialProvider(
            mockCredentialManager.addCredentials(
                "profile:admin",
                AwsBasicCredentials.create("Access", "Secret"),
                true
            )
        )

        assertThat(manager.activeCredentialProvider.id).isEqualTo("profile:admin")

        ApplicationManager.getApplication().messageBus.syncPublisher(CredentialManager.CREDENTIALS_CHANGED)
            .providerRemoved("profile:admin")
        assertThat(manager.hasActiveCredentials()).isFalse()
    }

    private fun changeCredentialProvider(credentialsProvider: ToolkitCredentialsProvider) {
        manager.changeCredentialProvider(credentialsProvider)
        waitForEvents(2)
    }

    private fun changeRegion(region: AwsRegion) {
        manager.changeRegion(region)
        waitForEvents(1)
    }

    private fun waitForEvents(eventCount: Int) {
        for (i in 1..5) {
            if (queue.size >= eventCount) {
                queue.clear()
                return
            }
            Thread.sleep(200)
        }

        throw IllegalStateException("Max wait time reached")
    }

    private fun Element?.string(): String = XMLOutputter().outputString(this)
}
