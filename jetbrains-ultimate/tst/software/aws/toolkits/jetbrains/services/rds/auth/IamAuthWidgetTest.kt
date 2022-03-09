// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds.auth

import com.intellij.database.dataSource.LocalDataSource
import com.intellij.database.dataSource.url.template.UrlEditorModel
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.jetbrains.datagrip.CREDENTIAL_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.REGION_ID_PROPERTY

class IamAuthWidgetTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val regionProvider = MockRegionProviderRule()

    @Rule
    @JvmField
    val credentialManager = MockCredentialManagerRule()

    private lateinit var widget: IamAuthWidget
    private val credentialId = RuleUtils.randomName()
    private val defaultRegion = RuleUtils.randomName()
    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")

    @Before
    fun setUp() {
        widget = IamAuthWidget()
        credentialManager.addCredentials(credentialId, mockCreds)
        regionProvider.addRegion(AwsRegion(defaultRegion, RuleUtils.randomName(), RuleUtils.randomName()))
    }

    @Test
    fun `Reset sets region if valid`() {
        widget.reset(buildDataSource(hasRegion = true), false)
        assertThat(widget.getSelectedRegion()?.id).isEqualTo(defaultRegion)
    }

    @Test
    fun `Reset does not set region if invalid`() {
        widget.reset(buildDataSource(hasRegion = true), false)
        assertThat(widget.getSelectedRegion()?.id).isEqualTo(defaultRegion)
        widget.reset(buildDataSource(hasRegion = false), false)
        assertThat(widget.getSelectedRegion()?.id).isEqualTo(defaultRegion)
    }

    @Test
    fun `Reset sets credentials if valid`() {
        widget.reset(buildDataSource(hasCredentials = true), false)
        assertThat(widget.getSelectedCredential()).isEqualTo(credentialId)
    }

    @Test
    fun `Reset does not set credentials if invalid`() {
        widget.reset(buildDataSource(hasCredentials = true), false)
        assertThat(widget.getSelectedCredential()).isEqualTo(credentialId)
        widget.reset(buildDataSource(hasCredentials = false), false)
        assertThat(widget.getSelectedCredential()).isEqualTo(null)
    }

    @Test
    fun `Sets region from URL`() {
        widget.reset(mock(), false)
        val endpointUrl = "jdbc:postgresql://abc.host.$defaultRegion.rds.amazonaws.com:5432/dev"
        widget.updateFromUrl(mock<UrlEditorModel> { on { url } doReturn endpointUrl })
        assertThat(widget.getSelectedRegion()?.id).isEqualTo(defaultRegion)
    }

    @Test
    fun `Does not unset region on invalid url`() {
        widget.reset(mock(), false)
        val endpointUrl = "jdbc:postgresql://abc.host.$defaultRegion.rds.amazonaws.com:5432/dev"
        widget.updateFromUrl(mock<UrlEditorModel> { on { url } doReturn endpointUrl })
        val badUrl = "jdbc:postgresql://abc.host.1000000%invalidregion.rds.amazonaws.com:5432/dev"
        widget.updateFromUrl(mock<UrlEditorModel> { on { url } doReturn badUrl })
        assertThat(widget.getSelectedRegion()?.id).isEqualTo(defaultRegion)
    }

    @Test
    fun `Save saves set signing host and port if set`() {
        widget.reset(mock { on { additionalProperties } doReturn mapOf(RDS_SIGNING_HOST_PROPERTY to "host", RDS_SIGNING_PORT_PROPERTY to "port") }, false)
        val m = mutableMapOf<String, String>()
        widget.save(mock { on { additionalProperties } doReturn m }, false)
        assertThat(m[RDS_SIGNING_HOST_PROPERTY]).isEqualTo("host")
        assertThat(m[RDS_SIGNING_PORT_PROPERTY]).isEqualTo("port")
    }

    @Test
    fun `Save saves null signing host and port if not set`() {
        val m = mutableMapOf<String, String>()
        widget.save(mock { on { additionalProperties } doReturn m }, false)
        assertThat(m[RDS_SIGNING_HOST_PROPERTY]).isNull()
        assertThat(m[RDS_SIGNING_PORT_PROPERTY]).isNull()
    }

    private fun buildDataSource(
        hasCredentials: Boolean = true,
        hasRegion: Boolean = true
    ): LocalDataSource = mock {
        on { additionalProperties } doAnswer {
            val m = mutableMapOf<String, String>()
            if (hasCredentials) {
                m[CREDENTIAL_ID_PROPERTY] = credentialId
            }
            if (hasRegion) {
                m[REGION_ID_PROPERTY] = defaultRegion
            }
            m
        }
    }
}
