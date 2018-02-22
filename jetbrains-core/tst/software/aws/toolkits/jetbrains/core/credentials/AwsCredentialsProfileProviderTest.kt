package software.aws.toolkits.jetbrains.core.credentials

import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.auth.profile.ProfilesConfigFile
import com.amazonaws.auth.profile.internal.BasicProfile
import com.intellij.openapi.project.Project
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.ProjectRule
import com.intellij.util.attribute
import com.intellij.util.get
import org.assertj.core.api.Assertions.assertThat
import org.jdom.Element
import org.jdom.input.SAXBuilder
import org.jdom.output.XMLOutputter
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.StringReader

class AwsCredentialsProfileProviderTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val temporaryDirectory = TemporaryFolder()

    private val testProfile = BasicProfile("TestProfile", emptyMap())

    private lateinit var credentialProvider: DefaultAwsCredentialsProfileProvider
    private lateinit var project: Project
    private lateinit var credentialFile: File

    @Before
    fun setUp() {
        credentialFile = createCredentialsFile()

        project = projectRule.project

        credentialProvider = DefaultAwsCredentialsProfileProvider(project)
        credentialProvider.reset()
        credentialProvider.credentialFileLocation = credentialFile.absolutePath
    }

    @Test
    fun testCredentialFileLoading() {
        CredentialFileWriter.dumpToFile(credentialFile, true, testProfile)
        credentialProvider.reloadCredentialFile()

        assertThat(credentialProvider.getProfiles())
                .hasSize(1)
                .element(0)
                .hasFieldOrPropertyWithValue("name", testProfile.profileName)
    }

    @Test
    fun testSaving() {
        val expectedState = """
                            <state>
                                <option name="credentialFileLocation" value="${credentialFile.absolutePath}" />
                                <option name="selectedProfileName" value="${testProfile.profileName}" />
                            </state>
                            """.trimMargin()

        CredentialFileWriter.dumpToFile(credentialFile, true, testProfile)
        credentialProvider.selectedProfile = CredentialFileBasedProfile(testProfile)

        assertThat(toXml(credentialProvider.state)).isEqualToIgnoringWhitespace(expectedState)
    }

    @Test
    fun testAddingCredentialProfile() {
        assertThat(ProfilesConfigFile(credentialFile).allBasicProfiles).isEmpty()

        credentialProvider.setProfiles(listOf(CredentialFileBasedProfile(testProfile)))
        assertThat(credentialProvider.getProfiles()).hasSize(1)

        // Triggers the save
        credentialProvider.state

        assertThat(ProfilesConfigFile(credentialFile).allBasicProfiles).hasSize(1)
    }

    @Test
    fun testDeletingCredentialProfile() {
        CredentialFileWriter.dumpToFile(credentialFile, true, testProfile)
        credentialProvider.reloadCredentialFile()

        credentialProvider.selectedProfile = CredentialFileBasedProfile(testProfile)

        assertThat(credentialProvider.getProfiles()).hasSize(1)

        credentialProvider.setProfiles(emptyList())

        val expectedState = """
                            <state>
                                <option name="credentialFileLocation" value="${credentialFile.absolutePath}" />
                            </state>
                            """.trimMargin()
        // deleting the selected profile should also reset the selected profile
        assertThat(credentialProvider.selectedProfile).isNull()
        assertThat(toXml(credentialProvider.state)).isEqualToIgnoringWhitespace(expectedState)

        assertThat(ProfilesConfigFile(credentialFile).allBasicProfiles).isEmpty()
    }

    @Test
    fun testLoading() {
        CredentialFileWriter.dumpToFile(credentialFile, true, testProfile)
        val serializedState = """
                              <state>
                                  <option name="credentialFileLocation" value="${credentialFile.absolutePath}" />
                                  <option name="selectedProfileName" value="${testProfile.profileName}" />
                              </state>
                              """.trimMargin()

        credentialProvider.loadState(fromXml(serializedState))

        assertThat(credentialProvider).satisfies {
            assertThat(it.credentialFileLocation).isEqualTo(credentialFile.absolutePath)
            assertThat(it.getProfiles()).hasSize(1)
            assertThat(it.selectedProfile).isNotNull()
        }
    }

    @Test
    fun testLoadingAProfileThatIsMissing() {
        val serializedState = """
                              <state>
                                  <option name="credentialFileLocation" value="${credentialFile.absolutePath}" />
                                  <option name="selectedProfileName" value="DoesNotExist" />
                              </state>
                              """.trimMargin()

        credentialProvider.loadState(fromXml(serializedState))

        assertThat(credentialProvider).satisfies {
            assertThat(it.credentialFileLocation).isEqualTo(credentialFile.absolutePath)
            assertThat(it.getProfiles()).isEmpty()
            assertThat(it.selectedProfile).isNull()
        }
    }

    @Test
    fun testSaveCustomProfile() {
        val testExtensionFactory = TestExtensionFactory()
        PlatformTestUtil.registerExtension(CredentialProfileFactory.EP_NAME, testExtensionFactory, project)

        val testExtensionProfile = testExtensionFactory.createProvider()
        testExtensionProfile.someField = "Hello"
        testExtensionProfile.name = "TestExtensionProfile"

        credentialProvider.addProfile(testExtensionProfile)
        credentialProvider.selectedProfile = testExtensionProfile

        val expectedState = """
                              <state>
                                  <option name="credentialFileLocation" value="${credentialFile.absolutePath}" />
                                  <option name="selectedProfileName" value="TestExtensionProfile" />
                                  <profiles>
                                      <profile id="TestExtension" name="TestExtensionProfile">
                                          <property someField="Hello" />
                                      </profile>
                                  </profiles>
                              </state>
                              """.trimMargin()
        assertThat(toXml(credentialProvider.state)).isEqualToIgnoringWhitespace(expectedState)
    }

    @Test
    fun testLoadCustomProfile() {
        val testExtensionFactory = TestExtensionFactory()
        PlatformTestUtil.registerExtension(CredentialProfileFactory.EP_NAME, testExtensionFactory, project)

        val serializedState = """
                              <state>
                                  <option name="credentialFileLocation" value="${credentialFile.absolutePath}" />
                                  <option name="selectedProfileName" value="TestExtensionProfile" />
                                  <profiles>
                                      <profile id="TestExtension" name="TestExtensionProfile">
                                          <property someField="Hello" />
                                      </profile>
                                  </profiles>
                              </state>
                              """.trimMargin()

        credentialProvider.loadState(fromXml(serializedState))

        assertThat(credentialProvider).satisfies {
            assertThat(it.credentialFileLocation).isEqualTo(credentialFile.absolutePath)
            assertThat(it.getProfiles())
                    .hasSize(1)
                    .element(0)
                    .hasFieldOrPropertyWithValue("name", "TestExtensionProfile")
                    .hasFieldOrPropertyWithValue("someField", "Hello")
            assertThat(it.selectedProfile).isNotNull()
        }
    }

    @Test
    fun testLoadCustomProfileNoLongerExists() {
        val serializedState = """
                              <state>
                                  <option name="credentialFileLocation" value="${credentialFile.absolutePath}" />
                                  <option name="selectedProfileName" value="BadProfile" />
                                  <profiles>
                                      <profile id="DoesNotExist" name="BadProfile">
                                          <property someField="Hello" />
                                      </profile>
                                  </profiles>
                              </state>
                              """.trimMargin()

        credentialProvider.loadState(fromXml(serializedState))

        assertThat(credentialProvider).satisfies {
            assertThat(it.credentialFileLocation).isEqualTo(credentialFile.absolutePath)
            assertThat(it.getProfiles()).isEmpty()
            assertThat(it.selectedProfile).isNull()
        }
    }

    private class TestExtensionProfile : CredentialProfile() {
        var someField: String? = null

        override val awsCredentials: AWSCredentialsProvider
            get() = throw UnsupportedOperationException("Not implemented")

        override val id = TestExtensionFactory.ID

        override fun save(project: Project, element: Element) {
            element.addContent(Element("property").attribute("someField", someField))
        }

        override fun load(project: Project, element: Element) {
            someField = element.get("property")?.getAttributeValue("someField")
        }
    }

    private class TestExtensionFactory : CredentialProfileFactory<TestExtensionProfile>() {
        override fun getKey(): String {
            return ID
        }

        override fun createProvider(): TestExtensionProfile {
            return TestExtensionProfile()
        }

        override val description: String
            get() = ""

        override fun configurationComponent(): ProfileEditor<TestExtensionProfile> {
            throw UnsupportedOperationException("Not implemented")
        }

        override fun configurationComponent(source: CredentialProfile): ProfileEditor<TestExtensionProfile> {
            throw UnsupportedOperationException("Not implemented")
        }

        companion object {
            val ID = "TestExtension"
        }
    }

    private fun toXml(element: Element): String {
        return XMLOutputter().outputString(element)
    }

    private fun fromXml(xml: String): Element {
        return SAXBuilder().build(StringReader(xml)).rootElement
    }

    private fun createCredentialsFile(): File {
        return temporaryDirectory.newFile("credentials")
    }
}