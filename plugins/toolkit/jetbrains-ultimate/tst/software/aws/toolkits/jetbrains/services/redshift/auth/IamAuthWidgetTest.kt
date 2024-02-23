// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.redshift.auth

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
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.jetbrains.datagrip.CREDENTIAL_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.REGION_ID_PROPERTY

class IamAuthWidgetTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val regionProvider = MockRegionProviderRule()

    private lateinit var widget: IamAuthWidget
    private val credentialId = RuleUtils.randomName()
    private val defaultRegion = RuleUtils.randomName()
    private val defaultClusterId = RuleUtils.randomName()
    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")

    @Before
    fun setUp() {
        widget = IamAuthWidget()
        MockCredentialsManager.getInstance().addCredentials(credentialId, mockCreds)
        regionProvider.addRegion(regionProvider.createAwsRegion(defaultRegion))
    }

    @Test
    fun `No cluster id set is empty in widget`() {
        widget.reset(buildDataSource(hasCluster = false), false)
        assertThat(widget.getClusterId()).isEmpty()
    }

    @Test
    fun `Cluster id set from widget`() {
        widget.reset(buildDataSource(hasCluster = true), false)
        assertThat(widget.getClusterId()).isEqualTo(defaultClusterId)
    }

    @Test
    fun `Does not unset region on invalid url`() {
        widget.reset(mock(), false)
        val endpointUrl = "jdbc:redshift://redshift-cluster.host.$defaultRegion.redshift.amazonaws.com:5439/dev"
        widget.updateFromUrl(mock<UrlEditorModel> { on { url } doReturn endpointUrl })
        val badUrl = "jdbc:redshift://redshift-cluster.host.100000%InvalidRegion.redshift.amazonaws.com:5439/dev"
        widget.updateFromUrl(mock<UrlEditorModel> { on { url } doReturn badUrl })
        assertThat(widget.getSelectedRegion()?.id).isEqualTo(defaultRegion)
    }

    @Test
    fun `Sets region from URL`() {
        widget.reset(mock(), false)
        val endpointUrl = "jdbc:redshift://redshift-cluster.host.$defaultRegion.redshift.amazonaws.com:5439/dev"
        widget.updateFromUrl(mock<UrlEditorModel> { on { url } doReturn endpointUrl })
        assertThat(widget.getSelectedRegion()?.id).isEqualTo(defaultRegion)
    }

    private fun buildDataSource(hasCluster: Boolean = true): LocalDataSource = mock {
        on { additionalProperties } doAnswer {
            mutableMapOf<String, String>().also {
                it[CREDENTIAL_ID_PROPERTY] = credentialId
                it[REGION_ID_PROPERTY] = defaultRegion
                if (hasCluster) {
                    it[CLUSTER_ID_PROPERTY] = defaultClusterId
                }
            }
        }
    }
}
