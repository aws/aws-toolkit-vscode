package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.configurationStore.deserialize
import com.intellij.configurationStore.serialize
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.jdom.Element
import org.jdom.input.SAXBuilder
import org.jdom.output.XMLOutputter
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.credentials.CredentialProviderNotFound
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import java.io.ByteArrayInputStream

class DefaultProjectAccountSettingsManagerTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private lateinit var mockRegionManager: MockRegionProvider
    private val mockCredentialsFactory = MockCredentialProviderFactory.INSTANCE

    @Before
    fun setUp() {
        mockRegionManager = AwsRegionProvider.getInstance() as MockRegionProvider

        MockCredentialProviderFactory.registerExtension(projectRule.project)

        for (i in 1..5) {
            val mockRegion = "MockRegion-$i"
            mockRegionManager.addRegion(AwsRegion(mockRegion, mockRegion))
        }
    }

    @After
    fun tearDown() {
        mockCredentialsFactory.reset()
    }

    @Test
    fun testNoActiveCredentials() {
        val manager = DefaultProjectAccountSettingsManager(projectRule.project)
        assertThat(manager.hasActiveCredentials()).isFalse()
        assertThat(manager.recentlyUsedCredentials()).isEmpty()
        assertThatThrownBy { manager.activeCredentialProvider }
            .isInstanceOf(CredentialProviderNotFound::class.java)
    }

    @Test
    fun testMakingCredentialActive() {
        val project = projectRule.project
        val manager = DefaultProjectAccountSettingsManager(project)
        assertThat(manager.recentlyUsedCredentials()).isEmpty()

        val credentials = mockCredentialsFactory.createMockCredentials("Mock1")
        manager.activeCredentialProvider = credentials

        assertThat(manager.hasActiveCredentials()).isTrue()
        assertThat(manager.activeCredentialProvider).isEqualTo(credentials)
        assertThat(manager.recentlyUsedCredentials()).element(0).isEqualTo(credentials)

        val credentials2 = mockCredentialsFactory.createMockCredentials("Mock2")
        manager.activeCredentialProvider = credentials2

        assertThat(manager.recentlyUsedCredentials()).element(0).isEqualTo(credentials2)
        assertThat(manager.recentlyUsedCredentials()).element(1).isEqualTo(credentials)
    }

    @Test
    fun testMakingRegionActive() {
        val project = projectRule.project
        val manager = DefaultProjectAccountSettingsManager(project)
        assertThat(manager.recentlyUsedCredentials()).isEmpty()

        val region = mockRegionManager.lookupRegionById("MockRegion-1")
        manager.activeRegion = region

        assertThat(manager.activeRegion).isEqualTo(region)
        assertThat(manager.recentlyUsedRegions()).element(0).isEqualTo(region)

        val region2 = mockRegionManager.lookupRegionById("MockRegion-2")
        manager.activeRegion = region2

        assertThat(manager.recentlyUsedRegions()).element(0).isEqualTo(region2)
        assertThat(manager.recentlyUsedRegions()).element(1).isEqualTo(region)
    }

    @Test
    fun testMakingCredentialsActiveFiresNotification() {
        val project = projectRule.project
        val manager = DefaultProjectAccountSettingsManager(project)

        var gotNotification = false

        val busConnection = project.messageBus.connect()
        busConnection.subscribe(ProjectAccountSettingsManager.ACCOUNT_SETTINGS_CHANGED, object :
            ProjectAccountSettingsManager.AccountSettingsChangedNotifier {
            override fun activeRegionChanged(value: AwsRegion) {
                gotNotification = true
            }
        })

        manager.activeRegion = mockRegionManager.lookupRegionById("MockRegion-1")

        assertThat(gotNotification).isTrue()
    }

    @Test
    fun testMakingRegionActiveFiresNotification() {
        val project = projectRule.project
        val manager = DefaultProjectAccountSettingsManager(project)

        var gotNotification = false

        val busConnection = project.messageBus.connect()
        busConnection.subscribe(ProjectAccountSettingsManager.ACCOUNT_SETTINGS_CHANGED, object :
            ProjectAccountSettingsManager.AccountSettingsChangedNotifier {
            override fun activeCredentialsChanged(credentialsProvider: ToolkitCredentialsProvider) {
                gotNotification = true
            }
        })

        manager.activeCredentialProvider = mockCredentialsFactory.createMockCredentials("Mock")

        assertThat(gotNotification).isTrue()
    }

    @Test
    fun testSavingActiveRegion() {
        val manager = DefaultProjectAccountSettingsManager(projectRule.project)
        manager.activeRegion = AwsRegion.GLOBAL
        val element = manager.state.serialize()
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
        val manager = DefaultProjectAccountSettingsManager(projectRule.project)
        manager.activeCredentialProvider = mockCredentialsFactory.createMockCredentials("Mock")
        val element = manager.state.serialize()
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

        val credentials = mockCredentialsFactory.createMockCredentials("Mock")

        val manager = DefaultProjectAccountSettingsManager(projectRule.project)
        manager.loadState(element.deserialize())

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
        val manager = DefaultProjectAccountSettingsManager(projectRule.project)
        manager.loadState(element.deserialize())

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
        val manager = DefaultProjectAccountSettingsManager(projectRule.project)
        manager.loadState(element.deserialize())

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
        val manager = DefaultProjectAccountSettingsManager(projectRule.project)
        manager.loadState(element.deserialize())

        assertThat(manager.hasActiveCredentials()).isFalse()
        assertThat(manager.recentlyUsedCredentials()).isEmpty()
        assertThatThrownBy { manager.activeCredentialProvider }
            .isInstanceOf(CredentialProviderNotFound::class.java)
    }
}

private fun String.toElement(): Element {
    val stream = ByteArrayInputStream(this.toByteArray())
    val builder = SAXBuilder()
    return builder.build(stream).rootElement
}

private fun Element?.string(): String {
    return XMLOutputter().outputString(this)
}
