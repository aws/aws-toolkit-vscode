// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.wizard

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.schemas.model.DescribeSchemaResponse
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.credentials.MockAwsConnectionManager.ProjectAccountSettingsManagerRule
import software.aws.toolkits.jetbrains.services.lambda.wizard.SchemaResourceSelector.Companion.DEFAULT_EVENT_DETAIL_TYPE
import software.aws.toolkits.jetbrains.services.lambda.wizard.SchemaResourceSelector.Companion.DEFAULT_EVENT_SOURCE
import software.aws.toolkits.jetbrains.services.schemas.SchemaTemplateParameters
import software.aws.toolkits.jetbrains.services.schemas.resources.SchemasResources
import software.aws.toolkits.jetbrains.services.schemas.resources.SchemasResources.LIST_REGISTRIES_AND_SCHEMAS
import software.aws.toolkits.jetbrains.utils.waitToLoad

class SchemaSelectionPanelTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    @JvmField
    @Rule
    val connectionManager = ProjectAccountSettingsManagerRule(projectRule)

    private fun initMockResourceCache() {
        resourceCache.addEntry(
            projectRule.project,
            SchemasResources.getSchema(REGISTRY_NAME, AWS_SCHEMA_NAME),
            DescribeSchemaResponse.builder()
                .schemaName(AWS_SCHEMA_NAME)
                .content(AWS_SCHEMA)
                .schemaVersion(SCHEMA_VERSION)
                .build()
        )
        resourceCache.addEntry(
            projectRule.project,
            SchemasResources.getSchema(REGISTRY_NAME, PARTNER_SCHEMA_NAME),
            DescribeSchemaResponse.builder()
                .schemaName(PARTNER_SCHEMA_NAME)
                .content(PARTNER_SCHEMA)
                .schemaVersion(SCHEMA_VERSION)
                .build()
        )
        resourceCache.addEntry(
            projectRule.project,
            SchemasResources.getSchema(REGISTRY_NAME, CUSTOMER_UPLOADED_SCHEMA_NAME),
            DescribeSchemaResponse.builder()
                .schemaName(CUSTOMER_UPLOADED_SCHEMA_NAME)
                .content(CUSTOMER_UPLOADED_SCHEMA)
                .schemaVersion(SCHEMA_VERSION)
                .build()
        )
        resourceCache.addEntry(
            projectRule.project,
            SchemasResources.getSchema(REGISTRY_NAME, CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_NAME),
            DescribeSchemaResponse.builder()
                .schemaName(CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_NAME)
                .content(CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES)
                .schemaVersion(SCHEMA_VERSION)
                .build()
        )
        resourceCache.addEntry(
            projectRule.project,
            LIST_REGISTRIES_AND_SCHEMAS,
            listOf(REGISTRY_ITEM, AWS_SCHEMA_ITEM, PARTNER_SCHEMA_ITEM, CUSTOMER_UPLOADED_SCHEMA_ITEM, CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_ITEM)
        )
    }

    @Test
    fun schemaTemplateParametersNullWithoutSelection() {
        val schemaTemplateParameters = SchemaResourceSelector().buildSchemaTemplateParameters()

        assertThat(schemaTemplateParameters).isNull()
    }

    @Test
    fun schemaTemplateParametersFirstIfRegistrySelected() {
        val schemaSelectionSelector = createSelector()
        schemaSelectionSelector.schemasSelector.selectedItem = REGISTRY_ITEM

        val schemaTemplateParameters = schemaSelectionSelector.buildSchemaTemplateParameters()

        assertThat(schemaTemplateParameters?.schema?.name).isEqualTo(AWS_SCHEMA_NAME)
    }

    @Test
    fun schemaTemplateParametersBuiltAfterSelectionAwsSchema() {
        val schemaSelectionSelector = createSelector()
        schemaSelectionSelector.schemasSelector.selectedItem = AWS_SCHEMA_ITEM

        val schemaTemplateParameters = schemaSelectionSelector.buildSchemaTemplateParameters()

        assertAwsSchemaParameters(schemaTemplateParameters)
    }

    @Test
    fun schemaTemplateParametersBuiltAfterSelectionPartnerSchema() {
        val schemaSelectionSelector = createSelector()
        schemaSelectionSelector.schemasSelector.selectedItem = PARTNER_SCHEMA_ITEM

        val schemaTemplateParameters = schemaSelectionSelector.buildSchemaTemplateParameters()

        assertThat(schemaTemplateParameters).isNotNull
        assertThat(schemaTemplateParameters?.schema?.registryName).isEqualTo(REGISTRY_NAME)
        assertThat(schemaTemplateParameters?.schemaVersion).isEqualTo(SCHEMA_VERSION)

        assertThat(schemaTemplateParameters?.schema?.name).isEqualTo(PARTNER_SCHEMA_NAME)

        assertThat(schemaTemplateParameters?.templateExtraContext).isNotNull
        assertThat(schemaTemplateParameters?.templateExtraContext?.schemaRegistry).isEqualTo(REGISTRY_NAME)
        assertThat(schemaTemplateParameters?.templateExtraContext?.schemaRootEventName).isEqualTo("aws_partner_mongodb_com_Ticket_Created")
        assertThat(schemaTemplateParameters?.templateExtraContext?.schemaPackageHierarchy).isEqualTo(PARTNER_SCHEMA_EXPECTED_PACKAGE_NAME)
        assertThat(schemaTemplateParameters?.templateExtraContext?.source).isEqualTo("aws.partner-mongodb.com")
        assertThat(schemaTemplateParameters?.templateExtraContext?.detailType).isEqualTo("MongoDB Trigger for my_store.reviews")
        assertThat(schemaTemplateParameters?.templateExtraContext?.userAgent).isEqualTo(AWS_TOOLKIT_USER_AGENT)
    }

    @Test
    fun schemaTemplateParametersBuiltAfterSelectionCustomerUploadedSchema() {
        val schemaSelectionSelector = createSelector()
        schemaSelectionSelector.schemasSelector.selectedItem = CUSTOMER_UPLOADED_SCHEMA_ITEM

        val schemaTemplateParameters = schemaSelectionSelector.buildSchemaTemplateParameters()
        assertCustomerUploadedSchemaParameters(
            CUSTOMER_UPLOADED_SCHEMA_NAME,
            "Some_Awesome_Schema",
            CUSTOMER_UPLOADED_SCHEMA_EXPECTED_PACKAGE_NAME,
            schemaTemplateParameters
        )
    }

    @Test
    fun schemaTemplateParametersBuiltAfterSelectionCustomerUploadedSchemaMultipleTypes() {
        val schemaSelectionSelector = createSelector()
        runInEdtAndWait {
            schemaSelectionSelector.schemasSelector.selectedItem = CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_ITEM

            val schemaTemplateParameters = schemaSelectionSelector.buildSchemaTemplateParameters()
            assertCustomerUploadedSchemaParameters(
                CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_NAME,
                "Some_Awesome_Schema_Object_1",
                CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_EXPECTED_PACKAGE_NAME,
                schemaTemplateParameters
            )
        }
    }

    private fun assertAwsSchemaParameters(schemaTemplateParameters: SchemaTemplateParameters?) {
        assertThat(schemaTemplateParameters).isNotNull
        assertThat(schemaTemplateParameters?.schema?.registryName).isEqualTo(REGISTRY_NAME)
        assertThat(schemaTemplateParameters?.schemaVersion).isEqualTo(SCHEMA_VERSION)

        assertThat(schemaTemplateParameters?.schema?.name).isEqualTo(AWS_SCHEMA_NAME)

        assertThat(schemaTemplateParameters?.templateExtraContext).isNotNull
        assertThat(schemaTemplateParameters?.templateExtraContext?.schemaRegistry).isEqualTo(REGISTRY_NAME)
        assertThat(schemaTemplateParameters?.templateExtraContext?.schemaRootEventName).isEqualTo("EC2InstanceStateChangeNotification")
        assertThat(schemaTemplateParameters?.templateExtraContext?.schemaPackageHierarchy).isEqualTo(AWS_SCHEMA_EXPECTED_PACKAGE_NAME)
        assertThat(schemaTemplateParameters?.templateExtraContext?.source).isEqualTo("aws.ec2")
        assertThat(schemaTemplateParameters?.templateExtraContext?.detailType).isEqualTo("EC2 Instance State-change Notification")
        assertThat(schemaTemplateParameters?.templateExtraContext?.userAgent).isEqualTo(AWS_TOOLKIT_USER_AGENT)
    }

    private fun assertCustomerUploadedSchemaParameters(
        schemaName: String,
        schemaRootEventName: String,
        schemaPackageHierarchy: String,
        schemaTemplateParameters: SchemaTemplateParameters?
    ) {
        assertThat(schemaTemplateParameters).isNotNull
        assertThat(schemaTemplateParameters?.schema?.registryName).isEqualTo(REGISTRY_NAME)
        assertThat(schemaTemplateParameters?.schemaVersion).isEqualTo(SCHEMA_VERSION)

        assertThat(schemaTemplateParameters?.schema?.name).isEqualTo(schemaName)

        assertThat(schemaTemplateParameters?.templateExtraContext).isNotNull
        assertThat(schemaTemplateParameters?.templateExtraContext?.schemaRegistry).isEqualTo(REGISTRY_NAME)
        assertThat(schemaTemplateParameters?.templateExtraContext?.schemaRootEventName).isEqualTo(schemaRootEventName)
        assertThat(schemaTemplateParameters?.templateExtraContext?.schemaPackageHierarchy).isEqualTo(schemaPackageHierarchy)
        assertThat(schemaTemplateParameters?.templateExtraContext?.source).isEqualTo(DEFAULT_EVENT_SOURCE)
        assertThat(schemaTemplateParameters?.templateExtraContext?.detailType).isEqualTo(DEFAULT_EVENT_DETAIL_TYPE)
        assertThat(schemaTemplateParameters?.templateExtraContext?.userAgent).isEqualTo(AWS_TOOLKIT_USER_AGENT)
    }

    private fun createSelector(): SchemaResourceSelector {
        val selector = runInEdtAndGet {
            initMockResourceCache()

            val schemaSelectionSelector = SchemaResourceSelector()
            schemaSelectionSelector.awsConnection = connectionManager.settingsManager.connectionSettings()
            schemaSelectionSelector.reload()

            schemaSelectionSelector
        }

        selector.schemasSelector.waitToLoad()

        return selector
    }

    private companion object {
        private const val AWS_TOOLKIT_USER_AGENT = "AWSToolkit"

        private const val REGISTRY_NAME = "Registry"
        private val REGISTRY_ITEM = SchemaSelectionItem.RegistryItem(REGISTRY_NAME)

        private const val SCHEMA_VERSION = "1"

        private const val AWS_SCHEMA_NAME = "aws.ec2@EC2InstanceStateChangeNotification"
        private const val AWS_SCHEMA_EXPECTED_PACKAGE_NAME = "schema.aws.ec2.ec2instancestatechangenotification"
        private val AWS_SCHEMA_ITEM = SchemaSelectionItem.SchemaItem(AWS_SCHEMA_NAME, REGISTRY_NAME)
        private val AWS_SCHEMA = SchemaSelectionPanelTest::class.java.getResourceAsStream("/awsEventSchema.json.txt")!!.bufferedReader().readText()

        private const val PARTNER_SCHEMA_NAME = "aws.partner-mongodb.com/1234567-tickets@Ticket.Created"
        private const val PARTNER_SCHEMA_EXPECTED_PACKAGE_NAME = "schema.aws.partner.mongodb_com_1234567_tickets.ticket_created"
        private val PARTNER_SCHEMA_ITEM = SchemaSelectionItem.SchemaItem(PARTNER_SCHEMA_NAME, REGISTRY_NAME)
        private val PARTNER_SCHEMA = SchemaSelectionPanelTest::class.java.getResourceAsStream("/partnerEventSchema.json.txt")!!.bufferedReader().readText()

        private const val CUSTOMER_UPLOADED_SCHEMA_NAME = "someCustomer.SomeAwesomeSchema"
        private const val CUSTOMER_UPLOADED_SCHEMA_EXPECTED_PACKAGE_NAME = "schema.somecustomer_someawesomeschema"
        private val CUSTOMER_UPLOADED_SCHEMA_ITEM = SchemaSelectionItem.SchemaItem(CUSTOMER_UPLOADED_SCHEMA_NAME, REGISTRY_NAME)
        private val CUSTOMER_UPLOADED_SCHEMA =
            SchemaSelectionPanelTest::class.java.getResourceAsStream("/customerUploadedEventSchema.json.txt")!!.bufferedReader().readText()

        private const val CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_NAME = "someCustomer.multipleTypes@SomeOtherAwesomeSchema"
        private const val CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_EXPECTED_PACKAGE_NAME = "schema.somecustomer_multipletypes.someotherawesomeschema"
        private val CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_ITEM = SchemaSelectionItem.SchemaItem(CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_NAME, REGISTRY_NAME)
        private val CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES =
            SchemaSelectionPanelTest::class.java.getResourceAsStream("/customerUploadedEventSchemaMultipleTypes.json.txt")!!.bufferedReader().readText()
    }
}
