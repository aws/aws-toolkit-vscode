// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.util.SimpleModificationTracker
import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.codewhispererruntime.model.OptOutPreference
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.credentials.LegacyManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.sono.Q_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_REGION
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.getCompletionType
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.getTelemetryOptOutPreference
import software.aws.toolkits.jetbrains.services.codewhisperer.util.runIfIdcConnectionOrTelemetryEnabled
import software.aws.toolkits.jetbrains.services.codewhisperer.util.toCodeChunk
import software.aws.toolkits.jetbrains.settings.AwsSettings
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.telemetry.CodewhispererCompletionType

class CodeWhispererUtilTest {
    @JvmField
    @Rule
    val projectRule = JavaCodeInsightTestFixtureRule()

    @JvmField
    @Rule
    val clientManager = MockClientManagerRule()

    @JvmField
    @Rule
    val regionProvider = MockRegionProviderRule()

    lateinit var fixture: CodeInsightTestFixture
    private var isTelemetryEnabledDefault: Boolean = false

    @Before
    fun setup() {
        regionProvider.addRegion(Region.US_EAST_1)
        fixture = projectRule.fixture

        clientManager.create<SsoOidcClient>()
        isTelemetryEnabledDefault = AwsSettings.getInstance().isTelemetryEnabled
    }

    @After
    fun tearDown() {
        AwsSettings.getInstance().isTelemetryEnabled = isTelemetryEnabledDefault
    }

    @Test
    fun `checkIfIdentityCenterLoginOrTelemetryEnabled will execute callback if the connection is IamIdentityCenter`() {
        val modificationTracker = SimpleModificationTracker()
        val oldCount = modificationTracker.modificationCount

        val ssoConn = LegacyManagedBearerSsoConnection(startUrl = "fake url", region = "us-east-1", scopes = Q_SCOPES)

        runIfIdcConnectionOrTelemetryEnabled(ssoConn) { modificationTracker.incModificationCount() }

        val newCount = modificationTracker.modificationCount
        assertThat(newCount).isEqualTo(oldCount + 1L)
    }

    @Test
    fun `checkIfIdentityCenterLoginOrTelemetryEnabled will return null if the connection is not IamIdentityCenter and telemetry not enabled`() {
        val modificationTracker = SimpleModificationTracker()
        val oldCount = modificationTracker.modificationCount

        val builderIdConn = LegacyManagedBearerSsoConnection(startUrl = SONO_URL, region = SONO_REGION, scopes = Q_SCOPES)
        AwsSettings.getInstance().isTelemetryEnabled = false
        runIfIdcConnectionOrTelemetryEnabled(builderIdConn) { modificationTracker.incModificationCount() }

        val newCount = modificationTracker.modificationCount
        assertThat(newCount).isEqualTo(oldCount)
        fixture = projectRule.fixture
    }

    @Test
    fun `toCodeChunk case_1`() {
        val psiFile = fixture.configureByText(
            "Sample.java",
            """public class Main {
            |    public static void main() {
            |    }
            |}
            """.trimMargin()
        )

        val result = runBlocking {
            psiFile.virtualFile.toCodeChunk("fake/path")
        }.toList()

        assertThat(result).hasSize(2)

        assertThat(result[0].content).isEqualTo(
            """public class Main {
                |    public static void main() {
                |    }
            """.trimMargin()
        )
        assertThat(result[1].content).isEqualTo(
            """public class Main {
            |    public static void main() {
            |    }
            |}
            """.trimMargin()
        )
    }

    @Test
    fun `toCodeChunk case_2`() {
        val psiFile = fixture.configureByText("Sample.java", codeSample33Lines)

        val result = runBlocking {
            psiFile.virtualFile.toCodeChunk("fake/path")
        }.toList()

        assertThat(result).hasSize(5)

        // 0th
        assertThat(result[0].content).isEqualTo(
            """public int runBinarySearchRecursively(int[] sortedArray, int key, int low, int high) {
                |    int middle = low  + ((high - low) / 2);
            """.trimMargin()
        )
        assertThat(result[0].path).isEqualTo("fake/path")
        assertThat(result[0].nextChunk).isEqualTo(result[1].content)

        // 1st
        assertThat(result[1].content).isEqualTo(
            """|public int runBinarySearchRecursively(int[] sortedArray, int key, int low, int high) {
                    |    int middle = low  + ((high - low) / 2);
                    |    
                    |    if (high < low) {
                    |        return -1;
                    |    }
                    |
                    |    if (key == sortedArray[middle]) {
                    |        return middle;
                    |    } else if (key < sortedArray[middle]) {
            """.trimMargin()
        )
        assertThat(result[1].path).isEqualTo("fake/path")
        assertThat(result[1].nextChunk).isEqualTo(result[2].content)

        // 2nd
        assertThat(result[2].content).isEqualTo(
            """|        return runBinarySearchRecursively(sortedArray, key, low, middle - 1);
               |    } else {
               |        return runBinarySearchRecursively(sortedArray, key, middle + 1, high);
               |    }
               |}
               |
               |public int runBinarySearchIteratively(int[] sortedArray, int key, int low, int high) {
               |    int index = Integer.MAX_VALUE;
               |    
               |    while (low <= high) {
            """.trimMargin()
        )
        assertThat(result[2].path).isEqualTo("fake/path")
        assertThat(result[2].nextChunk).isEqualTo(result[3].content)

        // 3rd
        assertThat(result[3].content).isEqualTo(
            """|        int mid = low  + ((high - low) / 2);
       |        if (sortedArray[mid] < key) {
       |            low = mid + 1;
       |        } else if (sortedArray[mid] > key) {
       |            high = mid - 1;
       |        } else if (sortedArray[mid] == key) {
       |            index = mid;
       |            break;
       |        }
       |     }
            """.trimMargin()
        )
        assertThat(result[3].path).isEqualTo("fake/path")
        assertThat(result[3].nextChunk).isEqualTo(result[4].content)

        // 4th
        assertThat(result[4].content).isEqualTo(
            """|    
               |    return index;
               |}
            """.trimMargin()
        )
        assertThat(result[4].path).isEqualTo("fake/path")
        assertThat(result[4].nextChunk).isEqualTo(result[4].content)
    }

    @Test
    fun `test getCompletionType() should give Block completion type to multi-line completions that has at least two non-blank lines`() {
        assertThat(getCompletionType(aCompletion("test\n\n\t\nanother test"))).isEqualTo(CodewhispererCompletionType.Block)
        assertThat(getCompletionType(aCompletion("test\ntest\n"))).isEqualTo(CodewhispererCompletionType.Block)
        assertThat(getCompletionType(aCompletion("\n   \t\r\ntest\ntest"))).isEqualTo(CodewhispererCompletionType.Block)
    }

    @Test
    fun `test getCompletionType() should give Line completion type to line completions`() {
        assertThat(getCompletionType(aCompletion("test"))).isEqualTo(CodewhispererCompletionType.Line)
        assertThat(getCompletionType(aCompletion("test\n\t   "))).isEqualTo(CodewhispererCompletionType.Line)
    }

    @Test
    fun `test getCompletionType() should give Line completion type to multi-line completions that has at most 1 non-blank line`() {
        assertThat(getCompletionType(aCompletion("test\n\t"))).isEqualTo(CodewhispererCompletionType.Line)
        assertThat(getCompletionType(aCompletion("test\n    "))).isEqualTo(CodewhispererCompletionType.Line)
        assertThat(getCompletionType(aCompletion("test\n\r"))).isEqualTo(CodewhispererCompletionType.Line)
        assertThat(getCompletionType(aCompletion("\n\n\n\ntest"))).isEqualTo(CodewhispererCompletionType.Line)
    }

    @Test
    fun `test getTelemetryOptOutPreference() returns correct status based on AwsTelemetry`() {
        AwsSettings.getInstance().isTelemetryEnabled = true
        assertThat(AwsSettings.getInstance().isTelemetryEnabled).isTrue
        assertThat(getTelemetryOptOutPreference()).isEqualTo(OptOutPreference.OPTIN)

        AwsSettings.getInstance().isTelemetryEnabled = false
        assertThat(AwsSettings.getInstance().isTelemetryEnabled).isFalse
        assertThat(getTelemetryOptOutPreference()).isEqualTo(OptOutPreference.OPTOUT)
    }
}

private val codeSample33Lines =
    """public int runBinarySearchRecursively(int[] sortedArray, int key, int low, int high) {
       |    int middle = low  + ((high - low) / 2);
       |    
       |    if (high < low) {
       |        return -1;
       |    }
       |
       |    if (key == sortedArray[middle]) {
       |        return middle;
       |    } else if (key < sortedArray[middle]) {
       |        return runBinarySearchRecursively(sortedArray, key, low, middle - 1);
       |    } else {
       |        return runBinarySearchRecursively(sortedArray, key, middle + 1, high);
       |    }
       |}
       |
       |public int runBinarySearchIteratively(int[] sortedArray, int key, int low, int high) {
       |    int index = Integer.MAX_VALUE;
       |    
       |    while (low <= high) {
       |        int mid = low  + ((high - low) / 2);
       |        if (sortedArray[mid] < key) {
       |            low = mid + 1;
       |        } else if (sortedArray[mid] > key) {
       |            high = mid - 1;
       |        } else if (sortedArray[mid] == key) {
       |            index = mid;
       |            break;
       |        }
       |     }
       |    
       |    return index;
       |}
       |
    """.trimMargin()
