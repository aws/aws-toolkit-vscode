// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds.auth

import com.intellij.database.dataSource.LocalDataSource
import com.intellij.database.dataSource.url.template.UrlEditorModel
import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.doAnswer
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.mock
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.datagrip.CREDENTIAL_ID_PROPERTY
import software.aws.toolkits.jetbrains.core.datagrip.REGION_ID_PROPERTY
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider

class IamAuthWidgetTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private lateinit var widget: RdsAwsAuthWidget
    private val credentialId = RuleUtils.randomName()
    private val defaultRegion = RuleUtils.randomName()
    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")

    @Before
    fun setUp() {
        widget = RdsAwsAuthWidget()
        MockCredentialsManager.getInstance().addCredentials(credentialId, mockCreds)
        MockRegionProvider.getInstance().addRegion(AwsRegion(defaultRegion, RuleUtils.randomName(), RuleUtils.randomName()))
    }

    @Test
    fun `Reset sets region if valid`() {
        widget.reset(buildDataSource(hasRegion = true), false)
        assertThat(widget.getRegionFromWidget()).isEqualTo(defaultRegion)
    }

    @Test
    fun `Reset does not set region if invalid`() {
        widget.reset(buildDataSource(hasRegion = true), false)
        assertThat(widget.getRegionFromWidget()).isEqualTo(defaultRegion)
        widget.reset(buildDataSource(hasRegion = false), false)
        assertThat(widget.getRegionFromWidget()).isEqualTo(defaultRegion)
    }

    @Test
    fun `Reset sets credentials if valid`() {
        widget.reset(buildDataSource(hasCredentials = true), false)
        assertThat(widget.getCredentialsFromWidget()).isEqualTo(credentialId)
    }

    @Test
    fun `Reset does not set credentials if invalid`() {
        widget.reset(buildDataSource(hasCredentials = true), false)
        assertThat(widget.getCredentialsFromWidget()).isEqualTo(credentialId)
        widget.reset(buildDataSource(hasCredentials = false), false)
        assertThat(widget.getCredentialsFromWidget()).isEqualTo(credentialId)
    }

    @Test
    fun `Sets region from URL`() {
        widget.reset(mock(), false)
        val endpointUrl = "jdbc:postgresql://abc.host.$defaultRegion.rds.amazonaws.com:5432/dev"
        widget.updateFromUrl(mock<UrlEditorModel> { on { url } doReturn endpointUrl })
        assertThat(widget.getRegionFromWidget()).isEqualTo(defaultRegion)
    }

    @Test
    fun `Does not unset region on invalid url`() {
        widget.reset(mock(), false)
        val endpointUrl = "jdbc:postgresql://abc.host.$defaultRegion.rds.amazonaws.com:5432/dev"
        widget.updateFromUrl(mock<UrlEditorModel> { on { url } doReturn endpointUrl })
        val badUrl = "jdbc:postgresql://abc.host.1000000%invalidregion.rds.amazonaws.com:5432/dev"
        widget.updateFromUrl(mock<UrlEditorModel> { on { url } doReturn badUrl })
        assertThat(widget.getRegionFromWidget()).isEqualTo(defaultRegion)
    }

    private fun buildDataSource(
        hasCredentials: Boolean = true,
        hasRegion: Boolean = true
    ): LocalDataSource = mock {
        on { additionalJdbcProperties } doAnswer {
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

    // Get settings out of widget by saving settings
    private fun RdsAwsAuthWidget.getRegionFromWidget(): String? {
        val dataSource = buildDataSource()
        save(dataSource, false)
        return dataSource.additionalJdbcProperties[REGION_ID_PROPERTY]
    }

    private fun RdsAwsAuthWidget.getCredentialsFromWidget(): String? {
        val dataSource = buildDataSource()
        save(dataSource, false)
        return dataSource.additionalJdbcProperties[CREDENTIAL_ID_PROPERTY]
    }
}
