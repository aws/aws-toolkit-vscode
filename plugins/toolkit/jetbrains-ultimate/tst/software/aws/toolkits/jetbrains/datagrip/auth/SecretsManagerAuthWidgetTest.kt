// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.datagrip.auth

import com.intellij.database.dataSource.LocalDataSource
import com.intellij.database.dataSource.url.template.UrlEditorModel
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.RuleChain
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

class SecretsManagerAuthWidgetTest {
    private val projectRule = ProjectRule()
    private val credentialManager = MockCredentialManagerRule()
    private val regionProvider = MockRegionProviderRule()

    // If we don't control the order manually, regionProvider can run its before
    // before projectRule which causes a NPE
    @Rule
    @JvmField
    val ruleChain = RuleChain(
        projectRule,
        credentialManager,
        regionProvider
    )

    private lateinit var widget: SecretsManagerAuthWidget
    private val credentialId = RuleUtils.randomName()
    private val defaultRegion = RuleUtils.randomName()
    private val defaultSecretId = RuleUtils.randomName()
    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")

    @Before
    fun setUp() {
        widget = SecretsManagerAuthWidget()
        credentialManager.addCredentials(credentialId, mockCreds)
        regionProvider.addRegion(AwsRegion(defaultRegion, RuleUtils.randomName(), RuleUtils.randomName()))
    }

    @Test
    fun `No secret set is empty in widget`() {
        widget.reset(buildDataSource(hasSecret = false), false)
        assertThat(widget.getSecretId()).isEmpty()
    }

    @Test
    fun `Secret set from widget`() {
        widget.reset(buildDataSource(hasSecret = true), false)
        assertThat(widget.getSecretId()).isEqualTo(defaultSecretId)
    }

    @Test
    fun `Get url from secret property set from widget`() {
        widget.reset(buildDataSource(getUrlFromSecret = true), false)
        assertThat(widget.getUrlFromSecretSet()).isEqualTo(true)
        widget.reset(buildDataSource(getUrlFromSecret = false), false)
        assertThat(widget.getUrlFromSecretSet()).isEqualTo(false)
    }

    @Test
    fun `Sets region from Redshift URL`() {
        widget.reset(mock(), false)
        val endpointUrl = "jdbc:redshift://redshift-cluster.host.$defaultRegion.redshift.amazonaws.com:5439/dev"
        widget.updateFromUrl(mock<UrlEditorModel> { on { url } doReturn endpointUrl })
        assertThat(widget.getSelectedRegion()?.id).isEqualTo(defaultRegion)
    }

    @Test
    fun `Sets region from RDS URL`() {
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

    private fun buildDataSource(hasSecret: Boolean = true, getUrlFromSecret: Boolean = false): LocalDataSource = mock {
        on { additionalProperties } doAnswer {
            mutableMapOf<String, String>().also {
                it[CREDENTIAL_ID_PROPERTY] = credentialId
                it[REGION_ID_PROPERTY] = defaultRegion
                if (hasSecret) {
                    it[SECRET_ID_PROPERTY] = defaultSecretId
                }
                it[GET_URL_FROM_SECRET] = getUrlFromSecret.toString()
            }
        }
    }
}
